import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography } from 'antd';

const { Text } = Typography;

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-10">GMAT Quiz Platform</h1>
        
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Start Quiz Option */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-t-4 border-blue-500">
            <h2 className="text-xl font-semibold mb-4 text-blue-700">Start Quiz</h2>
            <p className="text-gray-600 mb-6">
              Take a customized quiz with your preferred settings for question types, difficulty, and time limit.
            </p>
            <button
              onClick={() => navigate('/config')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md hover:shadow-lg"
            >
              Start Quiz
            </button>
          </div>

          {/* Review Questions Option */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-t-4 border-purple-500">
            <h2 className="text-xl font-semibold mb-4 text-purple-700">Review Questions</h2>
            <p className="text-gray-600 mb-6">
              Admin access to review, add, or edit existing questions in the question bank. Manage the content for quizzes.
            </p>
            <button
              onClick={() => navigate('/review')}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors shadow-md hover:shadow-lg"
            >
              Review Questions
            </button>
          </div>

          {/* Import Questions Option */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border-t-4 border-green-500 relative">
            <h2 className="text-xl font-semibold mb-4 text-green-700">Import Questions</h2>
            <p className="text-gray-600 mb-6">
              Contribute to our question bank by sharing PDFs, Excel files, or question links that you want to be added to the platform.
            </p>
            <button
              onClick={() => navigate('/import')}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md hover:shadow-lg"
            >
              Import Questions
            </button>
            <div className="mt-4 bg-yellow-50 p-3 rounded-md border border-yellow-200">
              <Text className="text-yellow-700 text-sm">
                <span className="font-semibold">Note:</span> This feature is currently under development and will be live soon.
              </Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 