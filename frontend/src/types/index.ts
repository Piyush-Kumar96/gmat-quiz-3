export interface QuizItem {
  _id: string;
  chapter?: string;
  questionNumber?: number;
  type: string;
  questionText?: string;
  options?: string[];
  answerText?: string;
  explanationText?: string;
}

export interface QuizConfig {
  count: number;
  timeLimit: number;
}

export interface QuizResult {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string;
}

export interface QuizSubmission {
  quizId: string;
  score: number;
  total: number;
  percentage: number;
  results: QuizResult[];
  userQuizId?: string;
} 