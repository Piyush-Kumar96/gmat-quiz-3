# GMAT Quiz Platform

A full-stack application for taking GMAT practice quizzes. The platform supports importing questions from PDFs, taking timed quizzes, and reviewing results with explanations.

## Features

- PDF import for questions and answers
- Configurable quiz settings (number of questions, time limit)
- Timer for quiz completion
- Detailed results with explanations
- Modern, responsive UI
- User authentication and profiles
- Performance tracking by question type

## Tech Stack

- **Frontend**: React + TypeScript, React Router, Axios
- **Backend**: Node.js + Express + TypeScript
- **Database**: MongoDB via Mongoose
- **Auth**: JWT authentication

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- npm or yarn

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd gmat-quiz-2
```

2. Set up the backend:
```bash
cd backend
npm install
```

Create a `.env` file in the backend directory with:
```
MONGODB_URI=mongodb://localhost:27017/gmat-quiz
PORT=5006
JWT_SECRET=your-secret-key
```

3. Set up the frontend:
```bash
cd ../frontend
npm install
```

Create a `.env` file in the frontend directory with:
```
REACT_APP_API_URL=http://localhost:5006/api
```

## Running the Application

1. Start the backend server:
```bash
cd backend
npm run dev
```

2. Create a test user (optional):
```bash
cd backend
npm run create-test-user
```

3. Start the frontend development server:
```bash
cd frontend
npm start
```

The application will be available at `http://localhost:3000`

## Authentication

The application supports user authentication with the following features:

- **Registration**: Users can create an account with email, password, full name, and target GMAT score
- **Login**: Users can log in with email and password
- **Profile**: Users can view their profile with performance statistics

### Test User

For testing purposes, you can use the following credentials:

- Email: test@example.com
- Password: password123

## Usage

### Importing Questions

1. Navigate to the admin interface
2. Upload a PDF file containing questions
3. Select the PDF type (questions-only, answers-only, or mixed)
4. The system will parse and store the questions in the database

### Taking a Quiz

1. Configure your quiz settings (number of questions, time limit)
2. Start the quiz
3. Answer questions within the time limit
4. Submit your answers
5. Review your results and explanations

## Development

### Backend Structure

- `src/models/` - Mongoose models
- `src/routes/` - API routes
- `src/middleware/` - Express middleware
- `src/pdfImporter.ts` - PDF parsing logic

### Frontend Structure

- `src/components/` - Reusable React components
- `src/pages/` - Page components
- `src/services/` - API service functions
- `src/context/` - React context providers
- `src/types/` - TypeScript type definitions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT 
