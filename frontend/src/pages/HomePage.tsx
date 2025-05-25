import React from 'react';
import { useNavigate } from 'react-router-dom';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-12">GMAT Quiz Platform</h1>
        
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Take Quiz Option */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold mb-4">Take Quiz</h2>
            <p className="text-gray-600 mb-6">
              Start a new quiz with customizable settings for questions and time limit.
            </p>
            <button
              onClick={() => navigate('/config')}
              className="w-full btn btn-primary"
            >
              Start Quiz
            </button>
          </div>

          {/* Import PDF Option */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold mb-4">Import Questions</h2>
            <p className="text-gray-600 mb-6">
              Upload PDF files containing GMAT questions and answers.
            </p>
            <button
              onClick={() => navigate('/import')}
              className="w-full btn btn-primary"
            >
              Import PDF
            </button>
          </div>

          {/* Review Questions Option */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold mb-4">Review Questions</h2>
            <p className="text-gray-600 mb-6">
              Review and verify imported questions and answers in the database.
            </p>
            <button
              onClick={() => navigate('/review')}
              className="w-full btn btn-primary"
            >
              Review Questions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 