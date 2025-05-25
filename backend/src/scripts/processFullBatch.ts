import ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import * as path from 'path';

// Constants
const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
const BATCH_SIZE = 50;

async function main() {
    try {
        console.log('Starting batch processing...');
        
        // Read progress file if it exists
        const progressFilePath = path.join(__dirname, '../../exports/progress.json');
        let startRow = 4; // Default start row (DATA_START_ROW)
        
        try {
            const progressData = JSON.parse(await fs.readFile(progressFilePath, 'utf-8'));
            startRow = progressData.lastProcessedRow + 1;
            console.log(`Resuming from row ${startRow} based on progress file`);
        } catch (error) {
            console.log('No progress file found or error reading it, starting from the beginning');
        }
        
        // Command to run the extraction script with the specified batch
        const command = `npx ts-node src/scripts/extractQuestionsFromLinks.ts --startRow=${startRow} --batchSize=${BATCH_SIZE}`;
        
        console.log(`Running command: ${command}`);
        
        // Using child_process.spawn instead of exec for better handling of stdout/stderr
        const { spawn } = require('child_process');
        const process = spawn('npx', ['ts-node', 'src/scripts/extractQuestionsFromLinks.ts', 
                                     `--startRow=${startRow}`, `--batchSize=${BATCH_SIZE}`], 
                              { stdio: 'inherit' });
        
        process.on('close', (code) => {
            console.log(`Extraction process exited with code ${code}`);
        });
        
    } catch (error) {
        console.error('Error in batch processing:', error);
        process.exit(1);
    }
}

main(); 