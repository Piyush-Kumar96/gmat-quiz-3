import ExcelJS from 'exceljs';
import * as path from 'path';

async function listSheets() {
  const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
  
  try {
    console.log(`Reading Excel file: ${EXCEL_FILE_PATH}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE_PATH);
    
    console.log('\nAvailable worksheets:');
    workbook.eachSheet((sheet, id) => {
      console.log(`${id}: ${sheet.name}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

listSheets(); 