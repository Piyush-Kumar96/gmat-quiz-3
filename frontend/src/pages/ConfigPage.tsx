import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuizConfig } from '../types';

export const ConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<QuizConfig>({
    count: 20,
    timeLimit: 30
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/quiz', { state: { config } });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6">Quiz Configuration</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Questions
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={config.count}
              onChange={(e) => setConfig(prev => ({ ...prev, count: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Time Limit (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={config.timeLimit}
              onChange={(e) => setConfig(prev => ({ ...prev, timeLimit: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Start Quiz
          </button>
        </form>
      </div>
    </div>
  );
}; 