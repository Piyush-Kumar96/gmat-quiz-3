export interface Question {
  _id: string;
  questionText: string;
  questionType: string;
  subType?: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: number;
  category: string;
  tags: string[];
  paragraph?: string;
  source?: string;
  sourceDetails?: {
    url?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}