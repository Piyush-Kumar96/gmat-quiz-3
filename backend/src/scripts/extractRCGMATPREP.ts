import ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

// Constants - MODIFIED FOR GMATPREP
const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
const HTML_OUTPUT_DIR = path.join(__dirname, '../../exports/html_rc_gmatprep');
const FAILED_URLS_LOG_PATH = path.join(__dirname, '../../exports/failedUrls_rc_gmatprep.log');

// Configuration
const BATCH_SIZE = 100; // Process questions in batches of 100
const MAX_CONCURRENT_REQUESTS = 3; // Slightly increased concurrency
const MIN_REQUEST_DELAY = 2000;
const MAX_REQUEST_DELAY = 4000;
const MAX_RETRIES = 3; // Maximum retries for failed requests
const RETRY_DELAY = 5000; // Delay between retries in milliseconds
const CHECKPOINT_FILE = path.join(__dirname, '../../exports/extraction_checkpoint_rc_gmatprep.json');
const TEST_MODE = false; // Set to false to process all RC passages
const TEST_LIMIT = 3; // Number of RC passages to process in test mode

// Column indices for Excel file - Same as RC Exam Packs
const COL_INDEX = {
    QUESTION_NUM: 2,
    SOURCE: 3,
    RC_NUMBER: 4,
    LINK: 5,
    TOPIC: 6,
    RC_QUESTION_NUM: 7,
    DIFFICULTY: 8,
    STATUS: 9  // Column I for status updates
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
    
    // Modified to use "RC - GMATPREP" sheet
    const worksheet = workbook.getWorksheet('RC - GMATPREP');
    if (!worksheet) {
        throw new Error('Worksheet "RC - GMATPREP" not found');
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
        
        // Get the content with image URLs and rendered MathJax - modified for RC questions
        const { questionHtml, imageUrls } = await page.evaluate(() => {
            // Create a container for our extracted content
            const extractedContent = document.createElement('div');
            
            // Array to store image URLs specifically from the question text
            const questionImages: string[] = [];
            
            // Helper function to clean HTML elements
            function cleanElement(element: Element): Element {
                const clone = element.cloneNode(true) as Element;
                
                // Remove all script tags
                const scripts = clone.querySelectorAll('script');
                scripts.forEach(script => script.remove());
                
                // Remove style tags
                const styles = clone.querySelectorAll('style');
                styles.forEach(style => style.remove());
                
                // Remove onclick and other JavaScript event attributes from all elements
                const allElements = clone.querySelectorAll('*');
                allElements.forEach(el => {
                    // Remove all event handler attributes
                    const attributes = Array.from(el.attributes);
                    attributes.forEach(attr => {
                        if (attr.name.startsWith('on') || // Event handlers like onclick
                            attr.value.includes('javascript:') || // JavaScript URLs
                            attr.name === 'href' && attr.value.includes('javascript:')) {
                            el.removeAttribute(attr.name);
                        }
                    });
                });
                
                return clone;
            }
            
            // Find the bbcodeBoxOut container which holds both passage and questions
            const bbcodeBoxOut = document.querySelector('.bbcodeBoxOut');
            
            if (bbcodeBoxOut) {
                // Find all bbcodeBoxIn divs - first is passage, second contains questions
                const bbcodeBoxIns = bbcodeBoxOut.querySelectorAll('.bbcodeBoxIn');
                
                if (bbcodeBoxIns.length >= 1) {
                    // Extract passage from first bbcodeBoxIn
                    const passageBox = bbcodeBoxIns[0];
                    const passageDiv = document.createElement('div');
                    passageDiv.className = 'reading-passage';
                    
                    // Clean the passage HTML before adding
                    const cleanedPassage = cleanElement(passageBox);
                    passageDiv.innerHTML = cleanedPassage.innerHTML;
                    
                    extractedContent.appendChild(passageDiv);
                    
                    // Extract images from passage
                    const passageImages = passageBox.querySelectorAll('img');
                    passageImages.forEach(img => {
                        const src = img.getAttribute('src');
                        if (src) {
                            questionImages.push(src);
                            // Fix relative URLs in the actual HTML
                            if (src.startsWith('/')) {
                                img.setAttribute('src', `https://gmatclub.com${src}`);
                            }
                        }
                    });
                }
                
                if (bbcodeBoxIns.length >= 2) {
                    // Extract questions from second bbcodeBoxIn
                    const questionsBox = bbcodeBoxIns[1];
                    const questionsDiv = document.createElement('div');
                    questionsDiv.className = 'questions-container';
                    
                    // Clean the questions HTML before adding
                    const cleanedQuestions = cleanElement(questionsBox);
                    questionsDiv.innerHTML = cleanedQuestions.innerHTML;
                    
                    extractedContent.appendChild(questionsDiv);
                    
                    // Extract images from questions
                    const questionImgElements = questionsBox.querySelectorAll('img');
                    questionImgElements.forEach(img => {
                        const src = img.getAttribute('src');
                        if (src) {
                            questionImages.push(src);
                            // Fix relative URLs in the actual HTML
                            if (src.startsWith('/')) {
                                img.setAttribute('src', `https://gmatclub.com${src}`);
                            }
                        }
                    });
                }
                
                // Find all timer placeholders which contain question stats
                // These are typically named rc_timer_placeholder_1, rc_timer_placeholder_2, etc.
                const timerPlaceholders = document.querySelectorAll('[class^="rc_timer_placeholder_"]');
                if (timerPlaceholders.length > 0) {
                    const statsContainer = document.createElement('div');
                    statsContainer.className = 'question-stats-container';
                    
                    timerPlaceholders.forEach((placeholder, index) => {
                        const questionStatsDiv = document.createElement('div');
                        questionStatsDiv.className = `question-stats question-${index + 1}`;
                        
                        // Clean the stats HTML before adding
                        const cleanedStats = cleanElement(placeholder);
                        questionStatsDiv.innerHTML = cleanedStats.innerHTML;
                        
                        statsContainer.appendChild(questionStatsDiv);
                    });
                    
                    extractedContent.appendChild(statsContainer);
                }
                
                // Process MathJax elements across all extracted content
                const mathJaxElements = extractedContent.querySelectorAll('.MathJax');
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
                extractedContent.querySelectorAll('.MathJax_Preview, script[type="math/tex"]').forEach(el => {
                    el.parentNode?.removeChild(el);
                });
            } else {
                console.error("Could not find bbcodeBoxOut container for RC question");
            }
            
            // Also look for correctAnswerBlock and timerResultLeft outside main extraction
            // These may contain additional answer statistics
            const correctAnswerBlock = document.querySelector('.correctAnswerBlock');
            if (correctAnswerBlock) {
                const answerStatsDiv = document.createElement('div');
                answerStatsDiv.className = 'answer-stats';
                
                // Clean the answer stats HTML before adding
                const cleanedAnswerStats = cleanElement(correctAnswerBlock);
                answerStatsDiv.innerHTML = cleanedAnswerStats.innerHTML;
                
                extractedContent.appendChild(answerStatsDiv);
            }
            
            const timerResultLeft = document.querySelector('.timerResultLeft');
            if (timerResultLeft) {
                const sessionStatsDiv = document.createElement('div');
                sessionStatsDiv.className = 'session-stats';
                
                // Clean the session stats HTML before adding
                const cleanedSessionStats = cleanElement(timerResultLeft);
                sessionStatsDiv.innerHTML = cleanedSessionStats.innerHTML;
                
                extractedContent.appendChild(sessionStatsDiv);
            }
            
            return {
                questionHtml: extractedContent.outerHTML,
                imageUrls: questionImages // Return all image URLs found
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
    
    // Use RC number for the filename instead of question number,
    // since a single RC passage can contain multiple questions
    const fileName = `rc_${result.type}.html`;
    const filePath = path.join(HTML_OUTPUT_DIR, fileName);
    
    // Create a complete HTML document with metadata
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>RC ${result.type}</title>
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
        .reading-passage {
            margin-bottom: 20px;
            padding: 15px;
            background: #f5f5f5;
            border-left: 4px solid #007bff;
        }
        .questions-container {
            margin-top: 20px;
            padding: 10px;
            border-top: 2px solid #eee;
        }
        .question-stats-container {
            margin-top: 15px;
            padding: 10px;
            background: #f9f9f9;
            border-radius: 4px;
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
            <div><strong>RC Number:</strong> ${result.type}</div>
            <div><strong>Source:</strong> ${result.source}</div>
            <div><strong>Difficulty Level:</strong> ${result.difficultyLevel}</div>
            <div><strong>Topic:</strong> ${result.topic}</div>
            <div><strong>Question Number:</strong> ${result.questionNumber}</div>
        </div>
        ${result.questionHtml}
    </div>
</body>
</html>`;
    
    await fs.writeFile(filePath, fullHtml);
    console.log(`Saved HTML for RC ${result.type} to ${filePath}`);
}

async function main() {
    try {
        console.log('Starting HTML extraction with Puppeteer for RC GMATPREP questions...');
        
        if (TEST_MODE) {
            console.log(`TEST MODE: Will process only ${TEST_LIMIT} RC passages`);
        }
        
        // Ensure exports directory exists
        await fs.mkdir(HTML_OUTPUT_DIR, { recursive: true });
        
        const worksheet = await readExcelSheet();
        
        // Read checkpoint data
        const { lastProcessedRow, processedQuestions } = await readCheckpoint();
        console.log(`Resuming from row ${lastProcessedRow}, ${processedQuestions.length} RC passages already processed`);
        
        // Get total number of rows with data
        const totalRows = worksheet.rowCount;
        console.log(`Total rows in worksheet: ${totalRows}`);
        
        // Track processed RC numbers to avoid duplicate extractions
        const processedRCNumbers = new Set<string>();
        
        // Start from the checkpoint row
        let currentRow = lastProcessedRow;
        let lastRCNumber = ''; // Track the last RC number processed
        let processedCount = 0; // Count of RC passages processed in this run
        
        // Process rows until we reach the end of the worksheet
        while (currentRow <= totalRows) {
            // Check if we've reached the test limit
            if (TEST_MODE && processedCount >= TEST_LIMIT) {
                console.log(`TEST MODE: Reached limit of ${TEST_LIMIT} RC passages. Stopping.`);
                break;
            }
            
            const row = worksheet.getRow(currentRow);
            
            // Extract RC number
            const rcNumCell = row.getCell(COL_INDEX.RC_NUMBER);
            let rcNumber = '';
            
            if (typeof rcNumCell.value === 'number') {
                rcNumber = String(rcNumCell.value);
            } else if (typeof rcNumCell.value === 'string') {
                rcNumber = rcNumCell.value;
            } else if (rcNumCell.value && typeof rcNumCell.value === 'object') {
                if ('text' in rcNumCell.value) {
                    rcNumber = String(rcNumCell.value.text);
                } else if ('result' in rcNumCell.value) {
                    rcNumber = String(rcNumCell.value.result);
                } else {
                    rcNumber = '';
                }
            }
            
            // If empty row or no RC number, move to next row
            if (!rcNumber) {
                currentRow++;
                continue;
            }
            
            console.log(`Row ${currentRow}: RC Number = ${rcNumber}`);
            
            // Skip if this RC number has already been processed
            if (processedRCNumbers.has(rcNumber) || processedQuestions.includes(rcNumber)) {
                console.log(`Skipping RC ${rcNumber} - already processed`);
                currentRow++;
                continue;
            }
            
            // Only extract if RC number is different from the last one
            if (rcNumber !== lastRCNumber) {
                console.log(`New RC number ${rcNumber} detected. Extracting from URL...`);
                
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
                    console.log(`Processing RC ${rcNumber} from URL: ${url}`);
                    
                    // Extract metadata
                    const source = row.getCell(COL_INDEX.SOURCE).value?.toString() || '';
                    const difficultyLevel = row.getCell(COL_INDEX.DIFFICULTY).value?.toString() || '';
                    const topic = row.getCell(COL_INDEX.TOPIC).value?.toString() || '';
                    
                    // Get question number for reference
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
                        }
                    }
                    
                    try {
                        // Extract content from URL
                        const extracted = await extractContentFromPage(url, questionNumber);
                        
                        // Add metadata
                        extracted.source = source;
                        extracted.type = rcNumber;  // Use RC number for the type field
                        extracted.difficultyLevel = difficultyLevel;
                        extracted.topic = topic;
                        extracted.questionNumber = questionNumber;
                        
                        // Save HTML file using RC number as the filename
                        await saveHtmlFile(extracted);
                        
                        // Mark this RC number as processed
                        processedRCNumbers.add(rcNumber);
                        processedQuestions.push(rcNumber);
                        
                        // Update status in the Excel file
                        row.getCell(COL_INDEX.STATUS).value = 'Extracted';
                        
                        // Update last processed RC number
                        lastRCNumber = rcNumber;
                        
                        // Increment the processed count for test mode
                        processedCount++;
                        console.log(`Successfully extracted RC ${rcNumber} (${processedCount}/${TEST_MODE ? TEST_LIMIT : 'all'})`);
                    } catch (error) {
                        console.error(`Error extracting RC ${rcNumber}:`, error);
                        
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
                    console.log(`No valid URL found for RC ${rcNumber} at row ${currentRow}`);
                }
            } else {
                console.log(`RC ${rcNumber} is the same as last processed RC. Skipping extraction.`);
            }
            
            // Move to next row
            currentRow++;
        }
        
        console.log('\nExtraction Summary:');
        console.log(`Processed ${processedRCNumbers.size} RC passages`);
        console.log(`Last processed row: ${currentRow - 1}`);
        console.log(`HTML files saved to: ${HTML_OUTPUT_DIR}`);
        
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

// Run the script
main(); 