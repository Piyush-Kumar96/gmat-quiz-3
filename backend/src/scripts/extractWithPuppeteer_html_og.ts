import ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

// Constants
const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
const HTML_OUTPUT_DIR = path.join(__dirname, '../../exports/html_specific_og');
const FAILED_URLS_LOG_PATH = path.join(__dirname, '../../exports/failedUrls_og.log');

// Configuration
const BATCH_SIZE = 100; // Process questions in batches of 100
const MAX_CONCURRENT_REQUESTS = 3; // Slightly increased concurrency
const MIN_REQUEST_DELAY = 2000;
const MAX_REQUEST_DELAY = 4000;
const MAX_RETRIES = 3; // Maximum retries for failed requests
const RETRY_DELAY = 5000; // Delay between retries in milliseconds
const CHECKPOINT_FILE = path.join(__dirname, '../../exports/extraction_checkpoint_og.json');

// Column indices for Excel file
const COL_INDEX = {
    QUESTION_NUM: 2,
    SOURCE: 3,
    TYPE: 4,
    LINK: 5,
    DIFFICULTY: 6,
    TOPIC: 7,
    STATUS: 8  // Column H for status updates
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
    
    const worksheet = workbook.getWorksheet('Quant - OG Questions');
    if (!worksheet) {
        throw new Error('Worksheet "Quant - OG Questions" not found');
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
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }); // Increased timeout
        
        // Allow MathJax to render fully by waiting - this is crucial for proper math rendering
        await new Promise(resolve => setTimeout(resolve, 3000));
        
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

async function processBatch(worksheet: ExcelJS.Worksheet, startRow: number, batchSize: number, processedQuestions: string[] = []) {
    const limitConcurrency = pLimit(MAX_CONCURRENT_REQUESTS);
    const results: ExtractedContent[] = [];
    const failedUrls: { url: string; error: string; row: number }[] = [];
    let reachedEndOfData = false;

    // Find the last row with data
    const totalRows = worksheet.rowCount;
    const endRow = Math.min(startRow + batchSize - 1, totalRows);
    
    console.log(`Processing batch from row ${startRow} to ${endRow}...`);
    
    const promises = [];
    let consecutiveEmptyRows = 0;
    const MAX_CONSECUTIVE_EMPTY_ROWS = 5; // Stop after finding this many consecutive empty rows
    
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
        const row = worksheet.getRow(rowIndex);
        const questionNumber = row.getCell(COL_INDEX.QUESTION_NUM).value?.toString() || '';
        const linkCell = row.getCell(COL_INDEX.LINK);
        
        // Check if the row is empty (no question number and no URL)
        const isRowEmpty = (!questionNumber || questionNumber.trim() === '') && 
                           (!linkCell.value && !linkCell.hyperlink);
        
        if (isRowEmpty) {
            consecutiveEmptyRows++;
            console.log(`Empty row detected at row ${rowIndex}. Count: ${consecutiveEmptyRows}/${MAX_CONSECUTIVE_EMPTY_ROWS}`);
            
            // If we've found MAX_CONSECUTIVE_EMPTY_ROWS empty rows in a row, assume we've reached the end of the data
            if (consecutiveEmptyRows >= MAX_CONSECUTIVE_EMPTY_ROWS) {
                console.log(`Found ${MAX_CONSECUTIVE_EMPTY_ROWS} consecutive empty rows. Stopping processing.`);
                reachedEndOfData = true;
                break;
            }
            continue;
        }
        
        // Reset counter if we found a non-empty row
        consecutiveEmptyRows = 0;
        
        // Skip already processed questions
        if (processedQuestions.includes(questionNumber)) {
            console.log(`Skipping already processed question ${questionNumber}`);
            continue;
        }
        
        promises.push(
            limitConcurrency(async () => {
                try {
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

                    const source = row.getCell(COL_INDEX.SOURCE).value?.toString() || '';
                    const type = row.getCell(COL_INDEX.TYPE).value?.toString() || '';
                    const difficultyLevel = row.getCell(COL_INDEX.DIFFICULTY).value?.toString() || '';
                    const topic = row.getCell(COL_INDEX.TOPIC).value?.toString() || '';
                    
                    const extracted = await extractContentFromPage(url, questionNumber);
                    
                    // Add metadata to the extracted content
                    extracted.source = source;
                    extracted.type = type;
                    extracted.difficultyLevel = difficultyLevel;
                    extracted.topic = topic;
                    
                    results.push(extracted);
                    
                    // Update status in column H
                    row.getCell(COL_INDEX.STATUS).value = 'Extracted';
                    await worksheet.workbook.xlsx.writeFile(EXCEL_FILE_PATH);
                    
                    // Save HTML file immediately after extraction to avoid data loss
                    await saveHtmlFile(extracted);
                    
                    // Update processed questions list
                    processedQuestions.push(questionNumber);
                    
                    // Save checkpoint after each successful extraction
                    await saveCheckpoint(rowIndex, processedQuestions);
                    
                    // Add a random delay between requests
                    const delay = getRandomDelay();
                    console.log(`Waiting ${delay}ms before next request...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                } catch (error) {
                    failedUrls.push({
                        url: typeof row.getCell(COL_INDEX.LINK)?.value === 'object' 
                            ? JSON.stringify(row.getCell(COL_INDEX.LINK)?.value) 
                            : row.getCell(COL_INDEX.LINK)?.value?.toString() || 'unknown',
                        error: (error as Error).message,
                        row: rowIndex
                    });
                    
                    // Update status in column H for failed extraction
                    row.getCell(COL_INDEX.STATUS).value = 'Failed';
                    await worksheet.workbook.xlsx.writeFile(EXCEL_FILE_PATH);
                }
            })
        );
    }

    await Promise.all(promises);
    return { results, failedUrls, lastProcessedRow: endRow, processedQuestions, reachedEndOfData };
}

// Save a single HTML file
async function saveHtmlFile(result: ExtractedContent): Promise<void> {
    await fs.mkdir(HTML_OUTPUT_DIR, { recursive: true });
    
    const fileName = `question_${result.questionNumber}.html`;
    const filePath = path.join(HTML_OUTPUT_DIR, fileName);
    
    // Create a complete HTML document with metadata
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Question ${result.questionNumber}</title>
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
    console.log(`Saved HTML for question ${result.questionNumber} to ${filePath}`);
}

async function main() {
    try {
        console.log('Starting HTML extraction with Puppeteer for OG questions...');
        
        // Ensure exports directory exists
        await fs.mkdir(HTML_OUTPUT_DIR, { recursive: true });
        
        const worksheet = await readExcelSheet();
        
        // Read checkpoint data
        const { lastProcessedRow, processedQuestions } = await readCheckpoint();
        console.log(`Resuming from row ${lastProcessedRow}, ${processedQuestions.length} questions already processed`);
        
        let currentRow = lastProcessedRow;
        let allResults: ExtractedContent[] = [];
        let allFailedUrls: { url: string; error: string; row: number }[] = [];
        let currentProcessedQuestions = [...processedQuestions];
        let reachedEndOfData = false;
        
        // Get total number of rows with data
        const totalRows = worksheet.rowCount;
        
        // Process in batches until we reach the end or detect the end of data
        while (currentRow <= totalRows && !reachedEndOfData) {
            const { 
                results, 
                failedUrls, 
                lastProcessedRow, 
                processedQuestions: newProcessedQuestions,
                reachedEndOfData: batchEndOfData
            } = await processBatch(worksheet, currentRow, BATCH_SIZE, currentProcessedQuestions);
            
            allResults = [...allResults, ...results];
            allFailedUrls = [...allFailedUrls, ...failedUrls];
            currentProcessedQuestions = newProcessedQuestions;
            reachedEndOfData = batchEndOfData;
            
            // Update for next batch
            currentRow = lastProcessedRow + 1;
            
            // Report progress
            console.log(`Completed batch. Progress: ${currentProcessedQuestions.length} questions processed`);
            
            // Save checkpoint
            await saveCheckpoint(currentRow, currentProcessedQuestions);
        }
        
        // Log failed URLs
        if (allFailedUrls.length > 0) {
            await fs.appendFile(FAILED_URLS_LOG_PATH, allFailedUrls.map(({url, error, row}) => 
                `[${new Date().toISOString()}] Row ${row}, ${url}: ${error}\n`
            ).join(''));
            
            console.log('Failed URLs:');
            allFailedUrls.forEach(({url, error, row}) => {
                console.log(`- Row ${row}, ${url}: ${error}`);
            });
        }
        
        console.log('\nExtraction Summary:');
        let actualQuestionsCount = currentProcessedQuestions.length;
        if (reachedEndOfData) {
            console.log(`Detected end of data after finding ${actualQuestionsCount} questions`);
        } else {
            console.log(`Reached end of sheet, processed ${actualQuestionsCount} questions`);
        }
        console.log(`Successful: ${currentProcessedQuestions.length}`);
        console.log(`Failed: ${allFailedUrls.length}`);
        console.log(`\nHTML files saved to: ${HTML_OUTPUT_DIR}`);
        console.log(`Failed URLs logged to: ${FAILED_URLS_LOG_PATH}`);
        
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

// Run the script
main(); 