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
  
  // GMAT Focus Edition Configuration
  isGmatFocus?: boolean;
  sectionOrder?: GMATSection[];
  breakAfterSection?: number; // 1 = after first section, 2 = after second section
  sections?: GMATSectionConfig[];
  currentSection?: number;
  totalSections?: number;
  
  // Existing options for compatibility
  isMockTest?: boolean;
  isSectionalTest?: boolean;
  sectionName?: string;
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

export interface GMATSectionConfig {
  name: GMATSection;
  questionCount: number;
  timeLimit: number; // in minutes
  questionTypes: string[];
  categories?: string[];
  completed?: boolean;
}

export type GMATSection = 'Quantitative Reasoning' | 'Verbal Reasoning' | 'Data Insights';

export interface GMATFocusState {
  currentSection: number;
  sectionsCompleted: boolean[];
  breakTaken: boolean;
  breakTimeLeft: number; // in seconds (600 = 10 minutes)
  isOnBreak: boolean;
  totalTimeSpent: number;
  sectionTimeSpent: number[];
} 