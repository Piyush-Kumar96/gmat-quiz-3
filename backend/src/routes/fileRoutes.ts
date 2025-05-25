import express from 'express';
import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';

// Define custom request interface with files property
interface FileUploadRequest extends Request {
  files?: {
    [fieldname: string]: any;
  };
}

const router = express.Router();

// Configure upload directory
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Upload file endpoint
router.post('/upload', async (req: FileUploadRequest, res: Response) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: 'No files were uploaded.' });
    }

    const file = req.files.file as any;
    const fileName = file.name;
    const filePath = path.join(uploadDir, fileName);

    // Move the file to the uploads directory
    await file.mv(filePath);

    res.json({
      message: 'File uploaded successfully',
      fileName: fileName,
      filePath: `/uploads/${fileName}`
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ message: 'Error uploading file' });
  }
});

// Get file endpoint
router.get('/:fileName', (req: Request, res: Response) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('File retrieval error:', error);
    res.status(500).json({ message: 'Error retrieving file' });
  }
});

export default router;