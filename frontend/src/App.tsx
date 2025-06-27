import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from './pages/HomePage';
import { ConfigPage } from './pages/ConfigPage';
import { QuizPage } from './pages/QuizPage';
import GMATFocusQuizPage from './pages/GMATFocusQuizPage';
import { ResultsPage } from './pages/ResultsPage';
import { ImportPage } from './pages/ImportPage';
import ReviewPage from './pages/ReviewPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { Navbar } from './components/Navbar';
import { AuthProvider } from './context/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Component to handle conditional navbar rendering
const AppContent = () => {
  const location = useLocation();
  const isQuizPage = location.pathname === '/quiz' || location.pathname === '/gmat-focus-quiz';
  
  return (
    <div className={`min-h-screen bg-gray-50 ${!isQuizPage ? 'pt-16' : ''}`}>
      {!isQuizPage && <Navbar />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/gmat-focus-quiz" element={<GMATFocusQuizPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
};