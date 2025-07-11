import axios from 'axios';
import { QuizItem, QuizConfig, QuizSubmission } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5006/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const getQuiz = async (config: QuizConfig) => {
  const response = await api.get('/quizzes', {
    params: config
  });
  return response.data;
};

export const submitQuiz = async (quizId: string, answers: Record<string, string>, timeSpent: number): Promise<QuizSubmission> => {
  try {
    const response = await api.post(`/quizzes/submit`, { 
      quizId,
      answers,
      timeSpent 
    });
    
    // Validate that the response contains the required fields
    const data = response.data;
    if (!data || typeof data.score !== 'number' || !Array.isArray(data.results)) {
      throw new Error('Invalid response format from server');
    }
    
    return data;
  } catch (error) {
    console.error('Error in submitQuiz:', error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error('Failed to submit quiz');
    }
  }
};

export const importPDF = async (file: File, type: 'questions' | 'answers' | 'mixed' = 'mixed') => {
  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('type', type);

  const response = await api.post('/import-pdf', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getQuizItems = async (page: number, limit: number) => {
  const response = await api.get('/quiz-items', {
    params: { page, limit }
  });
  return response.data;
};

export const deleteQuizItem = async (id: string) => {
  const response = await api.delete(`/quiz-items/${id}`);
  return response.data;
};

export const deleteQuestionBagItem = async (id: string) => {
  try {
    const response = await api.delete(`/quiz-items/question-bag/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting question from question bag:', error);
    throw error;
  }
};

interface QuestionBagFilters {
  page?: number;
  limit?: number;
  category?: string;
  questionType?: string;
  difficulty?: number;
  tags?: string[];
}

export const getQuestionBag = async (filters: QuestionBagFilters = {}) => {
  const response = await api.get('/quiz-items/question-bag', {
    params: {
      page: filters.page || 1,
      limit: filters.limit || 10,
      category: filters.category,
      questionType: filters.questionType,
      difficulty: filters.difficulty,
      tags: filters.tags?.join(',')
    }
  });
  return response.data;
};

export const getUserProfile = async () => {
  const response = await fetch(`${API_URL}/auth/profile`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }
  
  return response.json();
}; 

export const login = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  const { token, user } = response.data;
  
  // Store token in localStorage
  localStorage.setItem('token', token);
  
  return user;
};

export const register = async (userData: { email: string; password: string; fullName: string; }) => {
  const response = await api.post('/auth/register', userData);
  const { token, user } = response.data;
  
  // Store token in localStorage
  localStorage.setItem('token', token);
  
  return user;
};

export const logout = () => {
  localStorage.removeItem('token');
};

/**
 * Get random questions from QuestionBag for a quiz
 * @param count Number of questions to fetch (default: 20)
 * @param timeLimit Time limit in minutes (default: 30)
 * @param filters Optional filters (category, questionType, difficulty)
 */
export const getRandomQuestions = async (count = 20, timeLimit = 30, filters: Partial<QuestionBagFilters> = {}) => {
  const response = await api.get('/quiz-items/random-questions', {
    params: {
      count,
      timeLimit,
      ...filters
    }
  });
  return response.data;
};