import * as fs from 'fs/promises';
import * as path from 'path';
import pdfParse from 'pdf-parse';

// Constants
const PDF_DIRECTORY = path.join(__dirname, '../../pdfs');
const OUTPUT_DIRECTORY = path.join(__dirname, '../../exports');

interface QuestionData {
    questionText: string;
    options?: string[];
    answer?: string;
    pageNumber?: number;
    index?: number;
}

async function extractQuestionsFromPdf(pdfPath: string): Promise<QuestionData[]> {
    console.log(`Processing PDF: ${path.basename(pdfPath)}`);
    
    // Read the PDF file
    const dataBuffer = await fs.readFile(pdfPath);
    const data = await pdfParse(dataBuffer);
    
    console.log(`PDF has ${data.numpages} pages and ${data.text.length} characters`);
    
    const text = data.text;
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log(`Extracted ${lines.length} non-empty lines`);
    
    // Extract questions, options, and answers
    const questions: QuestionData[] = [];
    let currentQuestion: QuestionData | null = null;
    let collectingOptions = false;
    let questionCount = 0;
    let optionsCount = 0;
    let answersCount = 0;
    
    // Log some sample lines for debugging
    console.log("Sample lines:");
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        console.log(`Line ${i}: ${lines[i].substring(0, 100)}`);
    }
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this line is a question (ends with a question mark)
        if (line.includes('?') && !collectingOptions) {
            // If we were collecting a previous question, save it
            if (currentQuestion) {
                questions.push(currentQuestion);
                
                // Update counters
                if (currentQuestion.options && currentQuestion.options.length > 0) {
                    optionsCount++;
                }
                if (currentQuestion.answer) {
                    answersCount++;
                }
            }
            
            // Start a new question
            currentQuestion = {
                questionText: line,
                options: [],
                index: ++questionCount
            };
            collectingOptions = true;
            
            console.log(`Found question ${questionCount}: ${line.substring(0, 100)}`);
            continue;
        }
        
        // Check if this line is an option (starts with A), B), C), etc.)
        if (collectingOptions && currentQuestion && /^[A-E]\)/.test(line)) {
            if (!currentQuestion.options) {
                currentQuestion.options = [];
            }
            
            currentQuestion.options.push(line);
            console.log(`Found option: ${line}`);
            continue;
        }
        
        // Check if this line is an answer (contains "Answer: X" or similar)
        const answerMatch = line.match(/(?:Answer|Correct Answer|The answer is)[:\s]+([A-E])/i);
        if (answerMatch && currentQuestion) {
            currentQuestion.answer = answerMatch[1];
            console.log(`Found answer: ${currentQuestion.answer}`);
            collectingOptions = false; // End of current question
            continue;
        }
        
        // If we see a new question indicator, end the current question
        if (collectingOptions && line.match(/^(?:Question|Q\.)\s*\d+/i)) {
            if (currentQuestion) {
                questions.push(currentQuestion);
                
                // Update counters
                if (currentQuestion.options && currentQuestion.options.length > 0) {
                    optionsCount++;
                }
                if (currentQuestion.answer) {
                    answersCount++;
                }
            }
            collectingOptions = false;
            currentQuestion = null;
        }
    }
    
    // Don't forget the last question
    if (currentQuestion) {
        questions.push(currentQuestion);
        
        // Update counters
        if (currentQuestion.options && currentQuestion.options.length > 0) {
            optionsCount++;
        }
        if (currentQuestion.answer) {
            answersCount++;
        }
    }
    
    console.log(`\nExtraction Summary:`);
    console.log(`Total questions found: ${questionCount}`);
    console.log(`With options: ${optionsCount} (${Math.round(optionsCount/questionCount*100)}%)`);
    console.log(`With answers: ${answersCount} (${Math.round(answersCount/questionCount*100)}%)`);
    
    return questions;
}

async function main() {
    try {
        // Create output directory if it doesn't exist
        await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
        
        // Check if PDF directory exists
        try {
            await fs.access(PDF_DIRECTORY);
        } catch (error) {
            console.error(`Error: PDF directory not found at ${PDF_DIRECTORY}`);
            console.log('Creating the directory...');
            await fs.mkdir(PDF_DIRECTORY, { recursive: true });
            console.log(`Please place your PDF files in the directory: ${PDF_DIRECTORY}`);
            return;
        }
        
        // Get list of PDF files
        const files = await fs.readdir(PDF_DIRECTORY);
        const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
        
        if (pdfFiles.length === 0) {
            console.log(`No PDF files found in ${PDF_DIRECTORY}. Please add some PDF files and try again.`);
            return;
        }
        
        console.log(`Found ${pdfFiles.length} PDF file(s): ${pdfFiles.join(', ')}`);
        
        // Process each PDF file
        for (const pdfFile of pdfFiles) {
            const pdfPath = path.join(PDF_DIRECTORY, pdfFile);
            const questions = await extractQuestionsFromPdf(pdfPath);
            
            // Write questions to output file
            const outputPath = path.join(OUTPUT_DIRECTORY, `${path.basename(pdfFile, '.pdf')}_questions.json`);
            await fs.writeFile(outputPath, JSON.stringify(questions, null, 2));
            
            console.log(`Saved ${questions.length} questions to ${outputPath}`);
        }
        
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

// Run the script
main(); 