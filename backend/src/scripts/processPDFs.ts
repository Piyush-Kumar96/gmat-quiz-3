import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { PDFProcessor } from '../services/pdfProcessor';

dotenv.config();

const processPDFs = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');

    // Define the PDFs directory path
    const pdfsDir = path.join(__dirname, '../../pdfs');

    // Example usage - you'll need to replace these with your actual PDF filenames
    const chapter1Questions = path.join(pdfsDir, 'chapter1_questions.pdf');
    const chapter1Answers = path.join(pdfsDir, 'chapter1_answers.pdf');

    // Process Chapter 1
    console.log('Processing Chapter 1...');
    const count = await PDFProcessor.importChapterPDF(1, chapter1Questions, chapter1Answers);
    console.log(`Successfully imported ${count} questions from Chapter 1`);

    // You can add more chapters here following the same pattern
    // const chapter2Questions = path.join(pdfsDir, 'chapter2_questions.pdf');
    // const chapter2Answers = path.join(pdfsDir, 'chapter2_answers.pdf');
    // const count2 = await PDFProcessor.importChapterPDF(2, chapter2Questions, chapter2Answers);
    // console.log(`Successfully imported ${count2} questions from Chapter 2`);

    process.exit(0);
  } catch (error) {
    console.error('Error processing PDFs:', error);
    process.exit(1);
  }
};

// Run the script
processPDFs(); 