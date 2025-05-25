/**
 * PDF Format Checker
 * 
 * This script is designed to help understand the structure of text extracted from PDF files.
 * It displays the raw text content to help identify patterns in how questions and options
 * are formatted in the PDFs, which can be useful for improving extraction logic.
 * 
 * The script performs two main operations:
 * 1. Displays the first 30 paragraphs from the PDF to understand overall structure
 * 2. Searches for and displays examples of text that appear to be answer options (A,B,C,D,E format)
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Main function to process the PDF and analyze its structure
const main = async () => {
  try {
    // Define path to the PDF file
    const pdfDir = path.join(__dirname, '../../pdfs');
    const pdfFile = 'chapter1_questions.pdf';
    const pdfPath = path.join(pdfDir, pdfFile);
    
    console.log(`Processing ${pdfFile}...`);
    
    // Read and parse the PDF
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);
    
    // Split the text into paragraphs using blank lines as separators
    // This helps identify logical units of text in the PDF
    const paragraphs = pdfData.text.split(/\n\s*\n/);
    
    // Display the first 30 paragraphs to understand the general structure
    console.log("First 30 paragraphs:");
    for (let i = 0; i < Math.min(30, paragraphs.length); i++) {
      const para = paragraphs[i].trim();
      if (para) { // Skip empty paragraphs
        console.log(`--- Paragraph ${i+1} ---`);
        console.log(para);
        console.log();
      }
    }
    
    // Search for and display examples of text that match common option formats
    // This helps understand how answer options are formatted in the PDF
    console.log("\nSearching for option patterns...");
    let optionCount = 0;
    for (let i = 0; i < paragraphs.length && optionCount < 5; i++) {
      const para = paragraphs[i].trim();
      // Look for paragraphs that start with A), B), etc. or contain (A), (B), etc.
      if (para.match(/^[\(]?[A-E][\)\.]/) || para.match(/\([A-E]\)/)) {
        console.log(`--- Option Example ${optionCount+1} ---`);
        console.log(para);
        console.log();
        optionCount++;
      }
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
};

// Execute the script
main(); 