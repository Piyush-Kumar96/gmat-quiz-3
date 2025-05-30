export interface User {
  _id: string;
  email: string;
  fullName: string;
  targetScore: number;
  createdAt: string;
  phoneNumber?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  fullName: string;
  targetScore: number;
  phoneNumber?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  expiresIn?: string;
}

// Interface for user performance statistics
export interface UserStats {
  totalQuizzes: number;
  averageScore: number;
  questionTypeStats?: Array<{
    type: string;
    total: number;
    correct: number;
    percentage: number;
  }>;
}

// Expanded user profile with performance stats
export interface UserProfile {
  user: User;
  stats: UserStats;
} 