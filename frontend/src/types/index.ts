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
  category?: string;
  questionType?: string;
  difficulty?: string | number;
  
  // Additional configuration options
  questionTypeMode?: 'balanced' | 'specific';
  difficultyMode?: 'mixed' | 'specific';
  categoryMode?: 'mixed' | 'specific';
  
  // New options for enhanced configuration
  questionMode?: 'all' | 'incorrect' | 'specific' | 'custom';
  timeMode?: 'unlimited' | 'timed';
  studyMode?: 'study' | 'exam';
  hours?: number;
  minutes?: number;
  
  // Multi-select options
  selectedQuestionTypes?: string[];
  selectedCategories?: string[];
  selectedDifficulties?: string[];
}

export interface QuizResult {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string;
  
  // Additional fields for enhanced results display
  questionType?: string;
  questionText?: string;
  userAnswerText?: string;
  correctAnswerText?: string;
  passageText?: string;
  difficulty?: string;
}

export interface QuizSubmission {
  quizId: string;
  score: number;
  total: number;
  percentage: number;
  results: QuizResult[];
  userQuizId?: string;
  
  // Additional fields for enhanced results display
  timeSpent?: number;
  startTime?: Date;
  endTime?: Date;
} 