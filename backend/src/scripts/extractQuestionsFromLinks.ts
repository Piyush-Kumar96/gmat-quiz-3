import ExcelJS from 'exceljs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse';
import pLimit from 'p-limit';
import * as fs from 'fs/promises';
import * as path from 'path';

// Constants
const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
const SAMPLE_OUTPUT_PATH = path.join(__dirname, '../../exports/sampleQuestions.json');
const PROGRESS_FILE_PATH = path.join(__dirname, '../../exports/progress.json');
const FAILED_URLS_LOG_PATH = path.join(__dirname, '../../exports/failedUrls.log');

// Configuration
const BATCH_SIZE = 200;
const SAMPLE_SIZE = 20;
const MAX_CONCURRENT_REQUESTS = 3; // Reduced to avoid triggering rate limits
const MIN_REQUEST_DELAY = 3000; // Minimum delay between requests (3 seconds)
const MAX_REQUEST_DELAY = 7000; // Maximum delay between requests (7 seconds)
const RETRY_DELAYS = [5000, 10000, 15000]; // ms - more aggressive backoff

// Browser headers to mimic a real browser
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    'TE': 'Trailers',
    'DNT': '1' // Do Not Track
};

// Column indices for Excel file
const COL_INDEX = {
    QUESTION_NUM: 2,  // Q#
    SOURCE: 3,        // Source
    TYPE: 4,          // Type
    LINK: 5,          // Link
    DIFFICULTY: 6,    // Difficulty Level
    TOPIC: 7          // Topic
};

// Row indices
const HEADER_ROW = 3;
const DATA_START_ROW = 4;

interface QuestionData {
    questionNumber: string;
    source: string;
    type: string;
    url: string;
    questionText: string;
    options?: string[];
    answer?: string;
    difficulty?: string;
    topic?: string;
}

interface ProgressData {
    lastProcessedRow: number;
    totalProcessed: number;
    successful: number;
    failed: number;
    withOptions: number;
    withAnswers: number;
    lastBatchTime: string;
}

interface ExtractedContent {
    questionText: string;
    options?: string[];
    answer?: string;
}

// Stored cookies for each domain
const cookieJar: Record<string, string[]> = {};

// Function to add random delay between requests
function getRandomDelay(): number {
    return Math.floor(Math.random() * (MAX_REQUEST_DELAY - MIN_REQUEST_DELAY + 1)) + MIN_REQUEST_DELAY;
}

// Extract domain from URL
function getDomainFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return '';
    }
}

// Store cookies for a domain
function storeCookies(domain: string, setCookieHeaders: string | string[]) {
    if (!setCookieHeaders) return;
    
    if (!cookieJar[domain]) {
        cookieJar[domain] = [];
    }
    
    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    
    cookies.forEach(cookie => {
        // Extract just the name=value part (before the first ;)
        const simpleCookie = cookie.split(';')[0];
        if (simpleCookie) {
            cookieJar[domain].push(simpleCookie);
        }
    });
}

// Get cookies for a domain
function getCookiesForDomain(domain: string): string {
    if (!cookieJar[domain]) return '';
    return cookieJar[domain].join('; ');
}

async function readExcelSheet() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE_PATH);
    
    const worksheet = workbook.getWorksheet('Quant - GMATPREP');
    if (!worksheet) {
        throw new Error('Worksheet "Quant - GMATPREP" not found');
    }

    return worksheet;
}

async function extractFromHtml(html: string, url: string): Promise<ExtractedContent> {
    const $ = cheerio.load(html);
    let questionText = '';
    const options: string[] = [];
    let answer = '';
    
    // Debug info
    console.log(`Processing URL: ${url}`);
    
    // Try to find the question
    const questionSelectors = [
        '.question-text',
        '.item-text',
        'h1',
        'p:contains("?")'
    ];

    for (const selector of questionSelectors) {
        const text = $(selector).first().text().trim();
        if (text && text.includes('?')) {
            questionText = text;
            break;
        }
    }
    
    // If no question found yet, try another approach
    if (!questionText) {
        // Look for paragraphs with question marks
        const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
        for (const text of paragraphs) {
            if (text.includes('?')) {
                questionText = text;
                break;
            }
        }
    }
    
    // Still no question found, try to get the main content
    if (!questionText) {
        const mainContent = $('.main-content, #main-content, .content, #content').first().text();
        const match = mainContent.match(/([^.!?]+\?)/);
        if (match) {
            questionText = match[0].trim();
        }
    }
    
    if (!questionText) {
        throw new Error('No question found in HTML');
    }
    
    // Try to extract options - first check if it's GMATClub
    if (url.includes('gmatclub.com')) {
        // GMATClub specific selectors
        const optionBlocks = $('.bbcode_container, .post_body, .gmatclub_content');
        let optionsText = '';
        
        optionBlocks.each((_, block) => {
            optionsText += $(block).text();
        });
        
        // Match patterns like (A) option text, (B) option text
        const optionMatches = optionsText.match(/\([A-E]\)[^\(]+/g);
        if (optionMatches && optionMatches.length >= 4) {
            optionMatches.slice(0, 5).forEach(match => {
                options.push(match.trim());
            });
        }
        
        // Look for answer in spoiler tags or solution sections
        const answerSections = $('.spoiler_content, .reveal_content, .solution, .explanation');
        answerSections.each((_, section) => {
            const text = $(section).text();
            const answerMatch = text.match(/(?:answer|correct)[^\w]*(?:is|:)?[^\w]*([A-E])/i);
            if (answerMatch) {
                answer = answerMatch[1];
                return false; // break loop
            }
        });
    }
    
    // Try generic option extraction if none found yet
    if (options.length === 0) {
        // Check for standard GMAT option formats
        const optionSelectors = [
            '.answer-choice',
            '.answer-option',
            '.option',
            'li:contains("(A)")',
            'li:contains("(B)")',
            'li:contains("(C)")',
            'li:contains("(D)")',
            'li:contains("(E)")'
        ];
        
        // First try to find all options as a group
        const optionElements = $(optionSelectors.join(', '));
        if (optionElements.length >= 4) {
            optionElements.each((_, el) => {
                options.push($(el).text().trim());
            });
        }
        
        // If that didn't work, try to find options in the text
        if (options.length === 0) {
            const fullText = $('body').text();
            const optionRegex = /\(([A-E])\)\s*([^\(]+)(?=\([A-E]\)|$)/g;
            let match;
            
            while ((match = optionRegex.exec(fullText)) !== null) {
                options.push(`(${match[1]}) ${match[2].trim()}`);
            }
        }
    }
    
    // Deduplicate and clean options
    const cleanOptions = new Set<string>();
    options.forEach(option => {
        // Basic cleaning: remove extra whitespace, newlines, etc.
        const clean = option.replace(/\s+/g, ' ').trim();
        if (clean.length > 3) { // Ensure it's not just "(A)" with no content
            cleanOptions.add(clean);
        }
    });
    
    // If answer not found yet, try generic methods
    if (!answer) {
        // Look for elements with "answer" in their class or content
        const answerSelectors = [
            '.answer',
            '.correct-answer',
            '.solution',
            'div:contains("Answer: ")',
            'p:contains("Answer: ")',
            'div:contains("Official Answer: ")',
            'div:contains("The answer is ")'
        ];
        
        for (const selector of answerSelectors) {
            const answerEl = $(selector).first();
            if (answerEl.length) {
                const text = answerEl.text().trim();
                // Extract just the letter if it contains "Answer: X"
                const answerMatch = text.match(/Answer:\s*([A-E])/i) || 
                                    text.match(/The answer is\s*([A-E])/i) ||
                                    text.match(/Official Answer:\s*([A-E])/i);
                
                if (answerMatch) {
                    answer = answerMatch[1];
                    break;
                }
            }
        }
    }
    
    // Look for answer in the entire text as last resort
    if (!answer) {
        const fullText = $('body').text();
        const answerMatch = fullText.match(/(?:answer|correct)[^\w]*(?:is|:)?[^\w]*([A-E])/i);
        if (answerMatch) {
            answer = answerMatch[1];
        }
    }
    
    const finalOptions = Array.from(cleanOptions);
    
    // Log extraction results
    console.log(`Question found: ${questionText.substring(0, 50)}...`);
    console.log(`Options found: ${finalOptions.length}`);
    console.log(`Answer found: ${answer ? 'Yes (' + answer + ')' : 'No'}`);
    
    return {
        questionText,
        options: finalOptions.length > 0 ? finalOptions : undefined,
        answer: answer || undefined
    };
}

async function extractFromPdf(pdfBuffer: Buffer): Promise<ExtractedContent> {
    const data = await pdfParse(pdfBuffer);
    const lines = data.text.split('\n');
    
    let questionText = '';
    const options: string[] = [];
    let answer = '';
    
    // Try to find the question
    const questionRegex = /^(?:Question\s*\d+\s*[:\.-]\s*|Q\.?\s*\d+\s*[:\.-]\s*|)(.+?\?)/i;
    
    for (const line of lines) {
        const match = line.match(questionRegex);
        if (match) {
            questionText = match[1].trim();
            break;
        }
    }
    
    if (!questionText) {
        // Try a more general approach - look for any line with a question mark
        for (const line of lines) {
            if (line.includes('?')) {
                questionText = line.trim();
                break;
            }
        }
    }
    
    if (!questionText) {
        throw new Error('No question found in PDF');
    }
    
    // Try to find options
    const optionRegex = /^\s*\(([A-E])\)\s*(.+)$/;
    let foundOptions = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(optionRegex);
        
        if (match) {
            options.push(`(${match[1]}) ${match[2].trim()}`);
            foundOptions = true;
        } else if (foundOptions && options.length < 5 && line.length > 5) {
            // Might be a continuation of the previous option
            if (options.length > 0) {
                options[options.length - 1] += ` ${line}`;
            }
        }
    }
    
    // Try to find the answer
    const answerRegex = /(?:Answer|Correct)(?:\s*:|\s+is)?\s*([A-E])/i;
    
    for (const line of lines) {
        const match = line.match(answerRegex);
        if (match) {
            answer = match[1];
            break;
        }
    }
    
    return {
        questionText,
        options: options.length > 0 ? options : undefined,
        answer: answer || undefined
    };
}

async function fetchAndExtractQuestion(url: string): Promise<ExtractedContent> {
    let attempts = 0;
    let lastError: Error | null = null;
    
    // Extract domain for cookie handling
    const domain = getDomainFromUrl(url);
    
    while (attempts < RETRY_DELAYS.length) {
        try {
            console.log(`Fetching ${url}...`);
            
            // Prepare request headers with cookies if available
            const headers = { ...BROWSER_HEADERS };
            if (domain && cookieJar[domain]) {
                headers['Cookie'] = getCookiesForDomain(domain);
            }
            
            // Add a random delay before request to appear more human-like
            if (attempts > 0) {
                const delay = getRandomDelay();
                console.log(`Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Make the request
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000, // 30 second timeout
                headers,
                maxRedirects: 5
            });
            
            // Store any cookies for future requests
            if (response.headers['set-cookie'] && domain) {
                storeCookies(domain, response.headers['set-cookie']);
            }
            
            // Add a delay after successful request
            const postDelay = getRandomDelay();
            console.log(`Request successful. Waiting ${postDelay}ms before processing...`);
            await new Promise(resolve => setTimeout(resolve, postDelay));
            
            const contentType = response.headers['content-type'] || '';
            
            if (contentType.includes('application/pdf') || 
                (response.data.slice(0, 4).toString() === '%PDF')) {
                return await extractFromPdf(response.data);
            } else {
                return await extractFromHtml(response.data.toString(), url);
            }
        } catch (error) {
            lastError = error as Error;
            console.log(`Attempt ${attempts + 1} failed: ${(error as Error).message}`);
            
            if (attempts < RETRY_DELAYS.length - 1) {
                const delay = RETRY_DELAYS[attempts] + Math.floor(Math.random() * 2000); // Add some jitter
                console.log(`Will retry in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            attempts++;
        }
    }

    throw lastError || new Error('Failed to fetch and extract question');
}

async function processBatch(worksheet: ExcelJS.Worksheet, startRow: number, limit: number) {
    const limitConcurrency = pLimit(MAX_CONCURRENT_REQUESTS);
    const results: QuestionData[] = [];
    const failedUrls: { url: string; error: string }[] = [];
    let withOptions = 0;
    let withAnswers = 0;

    const promises = [];
    
    for (let i = 0; i < limit; i++) {
        const rowIndex = startRow + i;
        const row = worksheet.getRow(rowIndex);
        
        promises.push(
            limitConcurrency(async () => {
                try {
                    const linkCell = row.getCell(COL_INDEX.LINK);
                    let url = '';
                    
                    // Handle the hyperlink object
                    if (linkCell.value && typeof linkCell.value === 'object' && 'hyperlink' in linkCell.value) {
                        url = linkCell.value.hyperlink as string;
                    } else if (linkCell.value && typeof linkCell.value === 'object' && 'text' in linkCell.value) {
                        url = linkCell.value.text as string;
                    } else if (linkCell.hyperlink) {
                        url = linkCell.hyperlink as string;
                    } else {
                        throw new Error('No URL found in cell');
                    }
                    
                    if (!url || typeof url !== 'string') {
                        throw new Error('Invalid URL');
                    }

                    const extracted = await fetchAndExtractQuestion(url);
                    
                    // Count questions with options and answers
                    if (extracted.options && extracted.options.length > 0) {
                        withOptions++;
                    }
                    
                    if (extracted.answer) {
                        withAnswers++;
                    }
                    
                    results.push({
                        questionNumber: row.getCell(COL_INDEX.QUESTION_NUM).value?.toString() || '',
                        source: row.getCell(COL_INDEX.SOURCE).value?.toString() || '',
                        type: row.getCell(COL_INDEX.TYPE).value?.toString() || '',
                        url,
                        questionText: extracted.questionText,
                        options: extracted.options,
                        answer: extracted.answer,
                        difficulty: row.getCell(COL_INDEX.DIFFICULTY)?.value?.toString(),
                        topic: row.getCell(COL_INDEX.TOPIC)?.value?.toString(),
                    });
                } catch (error) {
                    failedUrls.push({
                        url: typeof row.getCell(COL_INDEX.LINK)?.value === 'object' 
                            ? JSON.stringify(row.getCell(COL_INDEX.LINK)?.value) 
                            : row.getCell(COL_INDEX.LINK)?.value?.toString() || 'unknown',
                        error: (error as Error).message
                    });
                }
            })
        );
    }

    await Promise.all(promises);
    return { results, failedUrls, withOptions, withAnswers };
}

async function saveProgress(progress: ProgressData) {
    await fs.mkdir(path.dirname(PROGRESS_FILE_PATH), { recursive: true });
    await fs.writeFile(PROGRESS_FILE_PATH, JSON.stringify(progress, null, 2));
}

async function logFailedUrls(failedUrls: { url: string; error: string }[]) {
    await fs.mkdir(path.dirname(FAILED_URLS_LOG_PATH), { recursive: true });
    const logMessage = failedUrls.map(({ url, error }) => 
        `[${new Date().toISOString()}] ${url}: ${error}\n`
    ).join('');
    await fs.appendFile(FAILED_URLS_LOG_PATH, logMessage);
}

async function ensureExportsDirectory() {
    const exportDir = path.dirname(SAMPLE_OUTPUT_PATH);
    await fs.mkdir(exportDir, { recursive: true });
}

async function main() {
    try {
        console.log('Starting question extraction...');
        
        // Ensure exports directory exists
        await ensureExportsDirectory();
        
        const worksheet = await readExcelSheet();
        
        console.log(`Processing first ${SAMPLE_SIZE} questions...`);
        const { results, failedUrls, withOptions, withAnswers } = await processBatch(worksheet, DATA_START_ROW, SAMPLE_SIZE);
        
        // Save sample results
        await fs.writeFile(SAMPLE_OUTPUT_PATH, JSON.stringify(results, null, 2));
        
        // Log failed URLs
        if (failedUrls.length > 0) {
            await logFailedUrls(failedUrls);
            console.log('Failed URLs:');
            failedUrls.forEach(({url, error}) => {
                console.log(`- ${url}: ${error}`);
            });
        }
        
        // Save progress
        const progress: ProgressData = {
            lastProcessedRow: DATA_START_ROW + SAMPLE_SIZE - 1,
            totalProcessed: SAMPLE_SIZE,
            successful: results.length,
            failed: failedUrls.length,
            withOptions,
            withAnswers,
            lastBatchTime: new Date().toISOString()
        };
        
        await saveProgress(progress);
        
        console.log('\nExtraction Summary:');
        console.log(`Total processed: ${SAMPLE_SIZE}`);
        console.log(`Successful: ${results.length}`);
        console.log(`With options: ${withOptions} (${Math.round(withOptions/results.length*100)}%)`);
        console.log(`With answers: ${withAnswers} (${Math.round(withAnswers/results.length*100)}%)`);
        console.log(`Failed: ${failedUrls.length}`);
        console.log(`\nSample results saved to: ${SAMPLE_OUTPUT_PATH}`);
        console.log(`Progress saved to: ${PROGRESS_FILE_PATH}`);
        console.log(`Failed URLs logged to: ${FAILED_URLS_LOG_PATH}`);
        
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

// Run the script
main(); 