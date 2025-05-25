import axios from 'axios';
import { LoginCredentials, RegisterCredentials, AuthResponse, UserProfile } from '../types/auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5006/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  const response = await api.post('/auth/login', credentials);
  const { user, token } = response.data;
  
  // Store token in localStorage
  localStorage.setItem('token', token);
  
  return { user, token };
};

export const register = async (credentials: RegisterCredentials): Promise<AuthResponse> => {
  const response = await api.post('/auth/register', credentials);
  const { user, token } = response.data;
  
  // Store token in localStorage
  localStorage.setItem('token', token);
  
  return { user, token };
};

export const logout = (): void => {
  localStorage.removeItem('token');
};

export const getCurrentUser = async (): Promise<UserProfile> => {
  const response = await api.get('/auth/profile');
  return response.data;
};

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('token');
}; 