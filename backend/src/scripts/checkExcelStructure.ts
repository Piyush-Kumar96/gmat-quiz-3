import ExcelJS from 'exceljs';
import * as path from 'path';

const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');

async function main() {
    try {
        console.log('Reading Excel file...');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(EXCEL_FILE_PATH);
        
        console.log('Available worksheets:');
        workbook.eachSheet((sheet) => {
            console.log(`- ${sheet.name}`);
        });
        
        const worksheet = workbook.getWorksheet('Quant - GMATPREP');
        if (!worksheet) {
            throw new Error('Worksheet "Quant - GMATPREP" not found');
        }
        
        console.log('\nAnalyzing worksheet: Quant - GMATPREP');
        console.log(`Total rows: ${worksheet.rowCount}`);
        console.log(`Total columns: ${worksheet.columnCount}`);
        
        // Read header row
        const headerRow = worksheet.getRow(1);
        console.log('\nHeader columns:');
        headerRow.eachCell((cell, colNumber) => {
            console.log(`${colNumber}: ${cell.value}`);
        });
        
        // Sample data from the first few rows
        console.log('\nSample data (first 5 rows):');
        for (let i = 2; i <= Math.min(6, worksheet.rowCount); i++) {
            const row = worksheet.getRow(i);
            let rowData = '';
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                rowData += `${cell.value}|`;
            });
            console.log(`Row ${i}: ${rowData}`);
        }
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main(); 