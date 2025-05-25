import React from 'react';
import { QuizItem } from '../types';

interface QuestionCardProps {
  question: QuizItem;
  selectedAnswer?: string;
  onAnswerSelect: (answer: string) => void;
  showResult?: boolean;
  isCorrect?: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  selectedAnswer,
  onAnswerSelect,
  showResult,
  isCorrect
}) => {
  return (
    <div className={`p-6 rounded-lg shadow-md ${showResult ? (isCorrect ? 'bg-green-50' : 'bg-red-50') : 'bg-white'}`}>
      <div className="mb-4">
        <span className="text-sm text-gray-500">Question {question.questionNumber}</span>
        <h3 className="text-lg font-medium mt-1">{question.questionText}</h3>
      </div>

      <div className="space-y-2">
        {question.options?.map((option, index) => (
          <button
            key={index}
            onClick={() => onAnswerSelect(option)}
            className={`w-full p-3 text-left rounded-md border ${
              selectedAnswer === option
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {showResult && (
        <div className="mt-4 p-4 rounded-md bg-gray-50">
          <p className="font-medium">
            {isCorrect ? 'Correct!' : 'Incorrect'}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            {question.explanationText}
          </p>
        </div>
      )}
    </div>
  );
}; 