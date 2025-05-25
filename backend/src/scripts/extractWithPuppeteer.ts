import ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

// Constants
const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
const SAMPLE_OUTPUT_PATH = path.join(__dirname, '../../exports/sampleQuestions.json');
const PROGRESS_FILE_PATH = path.join(__dirname, '../../exports/progress.json');
const FAILED_URLS_LOG_PATH = path.join(__dirname, '../../exports/failedUrls.log');

// Configuration
const SAMPLE_SIZE = 10; // Increased to 10 questions
const MAX_CONCURRENT_REQUESTS = 2; // Keep this low to avoid detection
const MIN_REQUEST_DELAY = 2000; // Reduced to 2 seconds
const MAX_REQUEST_DELAY = 4000; // Reduced to 4 seconds

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
    rawHtml?: string; // Store raw HTML for debugging
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
    rawHtml?: string;
}

// Function to add random delay between requests
function getRandomDelay(): number {
    return Math.floor(Math.random() * (MAX_REQUEST_DELAY - MIN_REQUEST_DELAY + 1)) + MIN_REQUEST_DELAY;
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

async function extractContentFromPage(url: string): Promise<ExtractedContent> {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920x1080',
        ]
    });
    
    try {
        console.log(`Opening browser for ${url}...`);
        const page = await browser.newPage();
        
        // Set viewport
        await page.setViewport({
            width: 1920,
            height: 1080
        });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // Navigate to the URL
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Take a screenshot for debugging
        const screenshotPath = path.join(__dirname, '../../exports/screenshots');
        await fs.mkdir(screenshotPath, { recursive: true });
        await page.screenshot({ path: path.join(screenshotPath, `${Date.now()}.png`) });
        
        // Get the HTML content
        const htmlContent = await page.content();
        
        // Extract the question text and options using the correct div structure
        const { questionText, options } = await page.evaluate(() => {
            // Helper function to clean text
            const cleanText = (text: string) => {
                return text
                    .replace(/\\n/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };
            
            // Find the post-info div and then the item text div within it
            const postInfoDiv = document.querySelector('.post-info.add-bookmark');
            if (!postInfoDiv) {
                console.log('Post info div not found');
                return { questionText: '', options: [] };
            }
            
            const itemTextDiv = postInfoDiv.querySelector('.item.text');
            if (!itemTextDiv) {
                console.log('Item text div not found');
                return { questionText: '', options: [] };
            }
            
            // Get all text nodes in the item text div
            const textNodes = Array.from(itemTextDiv.childNodes)
                .filter(node => node.nodeType === 3 || (node.nodeType === 1 && node.nodeName !== 'BR'))
                .map(node => node.textContent || '')
                .filter(text => text.trim());
            
            // Join all text nodes
            const fullText = textNodes.join(' ');
            
            // Find where options start (looking for pattern A. or (A) or A))
            const startMatch = fullText.match(/(?:[^A-Z]|^)((?:\()?[A](?:\)|\.)\s+[\w>≥<≤=])/);
            const optionStartIndex = startMatch ? startMatch.index + (startMatch[0].length - startMatch[1].length) : -1;
            
            // Extract question text (everything before options)
            let questionText = optionStartIndex !== -1 
                ? cleanText(fullText.substring(0, optionStartIndex))
                : cleanText(fullText);
                
            // Remove any "ShowHide Answer" and subsequent text from question
            questionText = questionText.split(/ShowHide Answer|Register\/Login/)[0].trim();
            
            // Extract options text (everything after the question but before "ShowHide Answer")
            const optionsText = optionStartIndex !== -1 
                ? fullText.substring(optionStartIndex).split(/ShowHide Answer|Register\/Login/)[0].trim()
                : '';
            
            // Parse options using regex
            const options: string[] = [];
            const optionRegex = /(?:^|\s)(?:\()?([A-E])(?:\)|\.)\s+([^A-E\s]*(?:[^A-E]|\s)*?)(?=\s*(?:[A-E][\.\)]|\s*(?:Show|$)))/g;
            let match;
            
            while ((match = optionRegex.exec(optionsText)) !== null) {
                const [, letter, text] = match;
                const optionText = cleanText(text);
                if (optionText) {
                    options.push(`(${letter}) ${optionText}`);
                }
            }
            
            // Clean up options - remove any that contain "ShowHide" or "Register"
            const cleanOptions = options.filter(opt => 
                !opt.includes('ShowHide') && 
                !opt.includes('Register') &&
                !opt.includes('Login')
            );
            
            return {
                questionText,
                options: cleanOptions.length >= 4 ? cleanOptions : []
            };
        });
        
        console.log(`Question found: ${questionText.substring(0, 50)}...`);
        console.log(`Options found: ${options.length}`);
        if (options.length > 0) {
            console.log('First option:', options[0]);
        }
        
        return {
            questionText,
            options: options.length >= 4 ? options : undefined,
            rawHtml: htmlContent
        };
        
    } catch (error) {
        console.error(`Error extracting content: ${(error as Error).message}`);
        throw error;
    } finally {
        await browser.close();
    }
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

                    const extracted = await extractContentFromPage(url);
                    
                    // Count questions with options and answers
                    if (extracted.options && extracted.options.length > 0) {
                        withOptions++;
                    }
                    
                    if (extracted.answer) {
                        withAnswers++;
                    }
                    
                    // Add it to results
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
                        rawHtml: extracted.rawHtml
                    });
                    
                    // Add a random delay between requests
                    const delay = getRandomDelay();
                    console.log(`Waiting ${delay}ms before next request...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
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
        console.log('Starting question extraction with Puppeteer...');
        
        // Ensure exports directory exists
        await ensureExportsDirectory();
        
        const worksheet = await readExcelSheet();
        
        console.log(`Processing first ${SAMPLE_SIZE} questions...`);
        const { results, failedUrls, withOptions, withAnswers } = await processBatch(worksheet, DATA_START_ROW, SAMPLE_SIZE);
        
        // Save sample results - save the raw HTML for debugging but don't include in final output
        const cleanResults = results.map(({rawHtml, ...rest}) => rest);
        await fs.writeFile(SAMPLE_OUTPUT_PATH, JSON.stringify(cleanResults, null, 2));
        
        // Save raw HTML for debugging
        const htmlDir = path.join(__dirname, '../../exports/html');
        await fs.mkdir(htmlDir, { recursive: true });
        
        for (let i = 0; i < results.length; i++) {
            if (results[i].rawHtml) {
                const htmlPath = path.join(htmlDir, `question_${i + 1}.html`);
                await fs.writeFile(htmlPath, results[i].rawHtml);
                console.log(`Saved HTML for question ${i + 1} to ${htmlPath}`);
            }
        }
        
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
        console.log(`With options: ${withOptions} (${Math.round((withOptions/results.length || 0)*100)}%)`);
        console.log(`With answers: ${withAnswers} (${Math.round((withAnswers/results.length || 0)*100)}%)`);
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