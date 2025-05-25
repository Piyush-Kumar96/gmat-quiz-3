import ExcelJS from 'exceljs';
import * as path from 'path';

async function checkExcelStructure() {
    const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
    
    try {
        console.log(`Loading Excel file: ${EXCEL_FILE_PATH}`);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(EXCEL_FILE_PATH);
        
        console.log('\n=== Worksheets ===');
        workbook.worksheets.forEach((worksheet, index) => {
            console.log(`${index + 1}. ${worksheet.name}`);
        });
        
        // Check if RC - Exam Packs sheet exists
        const rcSheet = workbook.getWorksheet('RC - Exam Packs');
        
        if (rcSheet) {
            console.log('\n=== RC - Exam Packs Sheet Structure ===');
            console.log(`Total Rows: ${rcSheet.rowCount}`);
            console.log(`Total Columns: ${rcSheet.columnCount}`);
            
            // Display header row
            console.log('\n=== Header Row (Row 3) ===');
            const headerRow = rcSheet.getRow(3);
            headerRow.eachCell((cell, colNumber) => {
                console.log(`Column ${colNumber} (${String.fromCharCode(64 + colNumber)}): ${cell.value}`);
            });
            
            // Display first data row sample
            console.log('\n=== First Data Row (Row 4) ===');
            const firstDataRow = rcSheet.getRow(4);
            firstDataRow.eachCell((cell, colNumber) => {
                const value = cell.value;
                let displayValue = value;
                
                // Handle hyperlink objects
                if (value && typeof value === 'object' && ('hyperlink' in value || 'text' in value)) {
                    displayValue = `Object: ${JSON.stringify(value)}`;
                }
                
                // Handle direct hyperlinks
                if (cell.hyperlink) {
                    displayValue = `Hyperlink: ${cell.hyperlink}`;
                }
                
                console.log(`Column ${colNumber} (${String.fromCharCode(64 + colNumber)}): ${displayValue}`);
            });
            
            // Count questions with URLs
            let questionCount = 0;
            for (let rowIndex = 4; rowIndex <= rcSheet.rowCount; rowIndex++) {
                const row = rcSheet.getRow(rowIndex);
                const questionNumber = row.getCell(2).value;
                const linkCell = row.getCell(5);
                
                if (questionNumber && (linkCell.value || linkCell.hyperlink)) {
                    questionCount++;
                }
            }
            
            console.log(`\nEstimated Question Count: ${questionCount}`);
        } else {
            console.log('\nError: "RC - Exam Packs" worksheet not found. Available worksheets:');
            workbook.worksheets.forEach(worksheet => {
                console.log(`- ${worksheet.name}`);
            });
        }
    } catch (error) {
        console.error('Error examining Excel file:', error);
    }
}

checkExcelStructure(); 