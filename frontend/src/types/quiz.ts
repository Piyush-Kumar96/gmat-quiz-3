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
  createdAt: Date;
  updatedAt: Date;
}