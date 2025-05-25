import ExcelJS from 'exceljs';
import * as path from 'path';

async function checkWorksheets() {
  try {
    const EXCEL_FILE_PATH = path.join(__dirname, '../../materials/GMAT Official Questions Bank OG GMAT Prep.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE_PATH);
    
    console.log('Available worksheets:');
    workbook.eachSheet((worksheet) => {
      console.log(`- "${worksheet.name}"`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

checkWorksheets(); 