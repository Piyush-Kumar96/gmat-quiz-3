export interface User {
  _id: string;
  email: string;
  fullName: string;
  targetScore: number;
  createdAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  fullName: string;
  targetScore: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface UserProfile {
  _id: string;
  email: string;
  fullName: string;
  targetScore: number;
  quizzesTaken: number;
  averageScore: number;
  breakdownByType: {
    [questionType: string]: {
      total: number;
      correct: number;
      percentage: number;
    };
  };
} 