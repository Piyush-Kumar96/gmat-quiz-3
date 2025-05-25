import ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

// Constants
const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
const HTML_OUTPUT_DIR = path.join(__dirname, '../../exports/html_cr_ogquestions');
const FAILED_URLS_LOG_PATH = path.join(__dirname, '../../exports/failedUrls_cr_og.log');

// Configuration
const BATCH_SIZE = 100; // Process questions in batches of 100
const MAX_CONCURRENT_REQUESTS = 5; // Increased concurrency for faster processing
const MIN_REQUEST_DELAY = 1000; // Reduced minimum delay
const MAX_REQUEST_DELAY = 2000; // Reduced maximum delay
const MAX_RETRIES = 3; // Maximum retries for failed requests
const RETRY_DELAY = 5000; // Delay between retries in milliseconds
const CHECKPOINT_FILE = path.join(__dirname, '../../exports/extraction_checkpoint_cr_og.json');
const TEST_MODE = false; // Set to false to process all CR questions
const TEST_LIMIT = 3; // Number of CR questions to process in test mode
const RESTART_CHECKPOINT = false; // Set to false to continue from last checkpoint

// Column indices for Excel file
const COL_INDEX = {
    QUESTION_NUM: 2,
    SOURCE: 3,
    LINK: 4,
    TYPE: 5,
    DIFFICULTY: 6,
    STATUS: 8  // Column I for status updates
};

// Row indices
const HEADER_ROW = 3;
const DATA_START_ROW = 4;

interface ExtractedContent {
    questionHtml: string;
    url: string;
    questionNumber: string;
    source: string;
    type: string;
    difficultyLevel: string;
    topic: string;
    imageUrls: string[]; // Original image URLs
}

// Function to add random delay between requests
function getRandomDelay(): number {
    return Math.floor(Math.random() * (MAX_REQUEST_DELAY - MIN_REQUEST_DELAY + 1)) + MIN_REQUEST_DELAY;
}

async function readExcelSheet() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE_PATH);
    
    const worksheet = workbook.getWorksheet('CR - OG Questions');
    if (!worksheet) {
        throw new Error('Worksheet "CR - OG Questions" not found');
    }
    
    return worksheet;
}

async function extractContentFromPage(url: string, questionNumber: string, retries = 0): Promise<ExtractedContent> {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--window-size=1366x768', // Smaller window size
        ]
    });
    
    try {
        console.log(`Opening browser for ${url}...`);
        const page = await browser.newPage();
        
        // Block unnecessary resources for faster loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        // Set viewport - reduced size for faster rendering
        await page.setViewport({
            width: 1366,
            height: 768
        });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // Navigate to the URL
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); // Changed to domcontentloaded instead of networkidle0
        
        // Allow MathJax to render with shorter wait time
        await new Promise(resolve => setTimeout(resolve, 1500)); // Reduced from 3000ms to 1500ms
        
        // Get the content with image URLs and rendered MathJax
        const { questionHtml, imageUrls } = await page.evaluate(() => {
            // Create a container for our extracted content
            const extractedContent = document.createElement('div');
            
            // Array to store image URLs specifically from the question text
            const questionImages: string[] = [];
            
            // 1. Extract and process the question text from .item.text
            const textDiv = document.querySelector('.item.text');
            
            if (textDiv) {
                const questionTextDiv = document.createElement('div');
                questionTextDiv.className = 'question-text';
                
                // Clone the content to avoid modifying the original
                const content = textDiv.cloneNode(true) as HTMLElement;
                
                // IMPORTANT: Only collect image URLs from within the question text
                const imgElements = content.querySelectorAll('img');
                imgElements.forEach(img => {
                    const src = img.getAttribute('src');
                    if (src) {
                        questionImages.push(src);
                        
                        // Fix relative URLs
                        if (src.startsWith('/')) {
                            img.setAttribute('src', `https://gmatclub.com${src}`);
                        }
                    }
                });
                
                // Process all MathJax elements to extract the rendered text
                const mathJaxElements = content.querySelectorAll('.MathJax');
                mathJaxElements.forEach(mjElement => {
                    // Create a new element to hold the rendered text
                    const mathTextSpan = document.createElement('span');
                    mathTextSpan.className = 'math-text';
                    
                    try {
                        // Get the actual rendered MathJax as it appears visually
                        const renderedMath = (mjElement as HTMLElement).innerText;
                        if (renderedMath && renderedMath.trim() !== '') {
                            mathTextSpan.textContent = renderedMath;
                            
                            // Replace the MathJax element with our text span
                            if (mjElement.parentNode) {
                                mjElement.parentNode.replaceChild(mathTextSpan, mjElement);
                            }
                        }
                    } catch (e) {
                        console.log('Error processing MathJax element:', e);
                    }
                });
                
                // Remove any remaining MathJax scripts or preview elements
                content.querySelectorAll('.MathJax_Preview, script[type="math/tex"]').forEach(el => {
                    el.parentNode?.removeChild(el);
                });
                
                // Add the processed content
                questionTextDiv.appendChild(content);
                extractedContent.appendChild(questionTextDiv);
            }
            
            // 2. Extract the correct answer block with percentages from .timerBox
            const correctAnswerBlock = document.querySelector('.correctAnswerBlock');
            if (correctAnswerBlock) {
                const answerStatsDiv = document.createElement('div');
                answerStatsDiv.className = 'answer-stats';
                answerStatsDiv.innerHTML = correctAnswerBlock.innerHTML;
                extractedContent.appendChild(answerStatsDiv);
            }
            
            // 3. Extract session statistics from .timerResultLeft
            const timerResultLeft = document.querySelector('.timerResultLeft');
            if (timerResultLeft) {
                const sessionStatsDiv = document.createElement('div');
                sessionStatsDiv.className = 'session-stats';
                sessionStatsDiv.innerHTML = timerResultLeft.innerHTML;
                extractedContent.appendChild(sessionStatsDiv);
            }
            
            return {
                questionHtml: extractedContent.outerHTML,
                imageUrls: questionImages // Only return images from question text
            };
        });
        
        // Log image URLs for debugging
        if (imageUrls.length > 0) {
            console.log(`Found ${imageUrls.length} images in question ${questionNumber} text`);
        } else {
            console.log(`No images found in question ${questionNumber} text`);
        }
        
        console.log(`Extracted HTML for question ${questionNumber}`);
        
        return {
            questionHtml,
            url,
            questionNumber,
            source: '',
            type: '',
            difficultyLevel: '',
            topic: '',
            imageUrls
        };
        
    } catch (error) {
        console.error(`Error extracting content: ${(error as Error).message}`);
        
        // Implement retry logic
        if (retries < MAX_RETRIES) {
            console.log(`Retrying (${retries + 1}/${MAX_RETRIES}) after ${RETRY_DELAY}ms...`);
            await browser.close();
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return extractContentFromPage(url, questionNumber, retries + 1);
        }
        
        throw error;
    } finally {
        await browser.close();
    }
}

// Function to read checkpoint data if it exists
async function readCheckpoint(): Promise<{ lastProcessedRow: number, processedQuestions: string[] }> {
    try {
        const checkpointData = await fs.readFile(CHECKPOINT_FILE, 'utf-8');
        return JSON.parse(checkpointData);
    } catch (error) {
        // Return default values if checkpoint doesn't exist
        return { lastProcessedRow: DATA_START_ROW, processedQuestions: [] };
    }
}

// Function to save checkpoint data
async function saveCheckpoint(lastProcessedRow: number, processedQuestions: string[]): Promise<void> {
    await fs.writeFile(
        CHECKPOINT_FILE,
        JSON.stringify({ lastProcessedRow, processedQuestions }, null, 2)
    );
    console.log(`Checkpoint saved: Row ${lastProcessedRow}, ${processedQuestions.length} questions processed`);
}

// Save a single HTML file
async function saveHtmlFile(result: ExtractedContent): Promise<void> {
    await fs.mkdir(HTML_OUTPUT_DIR, { recursive: true });
    
    const fileName = `cr_${result.questionNumber}.html`;
    const filePath = path.join(HTML_OUTPUT_DIR, fileName);
    
    // Create a complete HTML document with metadata
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>CR Question ${result.questionNumber}</title>
    <style>
        body { 
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
        }
        .question-container {
            max-width: 800px;
            margin: 0 auto;
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .source-url {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 10px;
        }
        .metadata {
            color: #444;
            font-size: 0.9em;
            margin-bottom: 20px;
            background: #f9f9f9;
            padding: 10px;
            border-radius: 4px;
        }
        .item.text {
            margin-bottom: 20px;
        }
        .math-text {
            font-family: monospace;
            background: #f5f5f5;
            padding: 2px 4px;
            border-radius: 3px;
            color: #a31515;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="question-container">
        <div class="source-url">Source: <a href="${result.url}">${result.url}</a></div>
        <div class="metadata">
            <div><strong>Question Number:</strong> ${result.questionNumber}</div>
            <div><strong>Source:</strong> ${result.source}</div>
            <div><strong>Type:</strong> ${result.type}</div>
            <div><strong>Difficulty Level:</strong> ${result.difficultyLevel}</div>
            <div><strong>Topic:</strong> ${result.topic}</div>
        </div>
        ${result.questionHtml}
    </div>
</body>
</html>`;
    
    await fs.writeFile(filePath, fullHtml);
    console.log(`Saved HTML for CR question ${result.questionNumber} to ${filePath}`);
}

async function main() {
    try {
        console.log('Starting HTML extraction with Puppeteer for CR OG Questions...');
        
        if (TEST_MODE) {
            console.log(`TEST MODE: Will process only ${TEST_LIMIT} CR questions`);
        }
        
        // Ensure exports directory exists
        await fs.mkdir(HTML_OUTPUT_DIR, { recursive: true });
        
        const worksheet = await readExcelSheet();
        
        // Read checkpoint data or restart if specified
        let lastProcessedRow = DATA_START_ROW;
        let processedQuestions: string[] = [];
        
        if (!RESTART_CHECKPOINT) {
            const checkpoint = await readCheckpoint();
            lastProcessedRow = checkpoint.lastProcessedRow;
            processedQuestions = checkpoint.processedQuestions;
            console.log(`Resuming from row ${lastProcessedRow}, ${processedQuestions.length} CR questions already processed`);
        } else {
            console.log('Restarting checkpoint: Starting from the beginning');
        }
        
        // Get total number of rows with data
        const totalRows = worksheet.rowCount;
        console.log(`Total rows in worksheet: ${totalRows}`);
        
        // Track processed question numbers to avoid duplicate extractions
        const processedQuestionNumbers = new Set<string>(processedQuestions);
        
        // Start from the checkpoint row
        let currentRow = lastProcessedRow;
        let processedCount = 0; // Count of CR questions processed in this run
        
        // Process rows until we reach the end of the worksheet
        while (currentRow <= totalRows) {
            // Check if we've reached the test limit
            if (TEST_MODE && processedCount >= TEST_LIMIT) {
                console.log(`TEST MODE: Reached limit of ${TEST_LIMIT} CR questions. Stopping.`);
                break;
            }
            
            const row = worksheet.getRow(currentRow);
            
            // Extract question number
            const questionNumCell = row.getCell(COL_INDEX.QUESTION_NUM);
            let questionNumber = '';
            
            if (typeof questionNumCell.value === 'number') {
                questionNumber = String(questionNumCell.value);
            } else if (typeof questionNumCell.value === 'string') {
                questionNumber = questionNumCell.value;
            } else if (questionNumCell.value && typeof questionNumCell.value === 'object') {
                if ('text' in questionNumCell.value) {
                    questionNumber = String(questionNumCell.value.text);
                } else if ('result' in questionNumCell.value) {
                    questionNumber = String(questionNumCell.value.result);
                } else {
                    questionNumber = '';
                }
            }
            
            // If empty row or no question number, move to next row
            if (!questionNumber || questionNumber === 'CRITICAL REASONING - OFFICIAL GUIDE' || questionNumber === 'Q#') {
                currentRow++;
                continue;
            }
            
            console.log(`Row ${currentRow}: CR Question Number = ${questionNumber}`);
            
            // Skip if this question has already been processed
            if (processedQuestionNumbers.has(questionNumber)) {
                console.log(`Skipping CR question ${questionNumber} - already processed`);
                currentRow++;
                continue;
            }
            
            // Get link cell
            const linkCell = row.getCell(COL_INDEX.LINK);
            let url = '';
            
            // Extract URL from cell
            if (linkCell.value && typeof linkCell.value === 'object' && 'hyperlink' in linkCell.value) {
                url = linkCell.value.hyperlink as string;
            } else if (linkCell.value && typeof linkCell.value === 'object' && 'text' in linkCell.value) {
                url = linkCell.value.text as string;
            } else if (linkCell.hyperlink) {
                url = linkCell.hyperlink as string;
            }
            
            // If URL is valid, extract the content
            if (url && typeof url === 'string') {
                console.log(`Processing CR question ${questionNumber} from URL: ${url}`);
                
                // Extract metadata
                const source = row.getCell(COL_INDEX.SOURCE).value?.toString() || '';
                const type = row.getCell(COL_INDEX.TYPE).value?.toString() || '';
                const difficultyLevel = row.getCell(COL_INDEX.DIFFICULTY).value?.toString() || '';
                const topic = ''; // No TOPIC column in sheet structure
                
                try {
                    // Extract content from URL
                    const extracted = await extractContentFromPage(url, questionNumber);
                    
                    // Add metadata
                    extracted.source = source;
                    extracted.type = type;
                    extracted.difficultyLevel = difficultyLevel;
                    extracted.topic = topic;
                    extracted.questionNumber = questionNumber;
                    
                    // Save HTML file
                    await saveHtmlFile(extracted);
                    
                    // Mark this question as processed
                    processedQuestionNumbers.add(questionNumber);
                    processedQuestions.push(questionNumber);
                    
                    // Update status in the Excel file
                    row.getCell(COL_INDEX.STATUS).value = 'Extracted';
                    
                    // Increment the processed count for test mode
                    processedCount++;
                    console.log(`Successfully extracted CR question ${questionNumber} (${processedCount}/${TEST_MODE ? TEST_LIMIT : 'all'})`);
                } catch (error) {
                    console.error(`Error extracting CR question ${questionNumber}:`, error);
                    
                    // Update status in the Excel file
                    row.getCell(COL_INDEX.STATUS).value = 'Failed';
                }
                
                // Save Excel file with status updates
                await worksheet.workbook.xlsx.writeFile(EXCEL_FILE_PATH);
                
                // Save checkpoint
                await saveCheckpoint(currentRow, processedQuestions);
                
                // Add a delay between requests
                const delay = getRandomDelay();
                console.log(`Waiting ${delay}ms before next request...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log(`No valid URL found for CR question ${questionNumber} at row ${currentRow}`);
            }
            
            // Move to next row
            currentRow++;
        }
        
        console.log('\nExtraction Summary:');
        console.log(`Processed ${processedQuestionNumbers.size} CR questions`);
        console.log(`Last processed row: ${currentRow - 1}`);
        console.log(`HTML files saved to: ${HTML_OUTPUT_DIR}`);
        
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

// Run the script
main(); 