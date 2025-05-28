import React from 'react';
import { Card, Typography, Button, Space, Divider } from 'antd';
import { Question } from '../types/quiz';
import { RCQuestionCard } from './RCQuestionCard';
import { CRQuestionCard } from './CRQuestionCard';
import { DSQuestionCard } from './DSQuestionCard';
import { PSQuestionCard } from './PSQuestionCard';

const { Text, Paragraph } = Typography;

interface QuestionCardProps {
  question: Question;
  selectedOption?: string;
  onChange?: (questionId: string, option: string) => void;
  showAnswer?: boolean;
  correctAnswer?: string;
  explanation?: string;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  selectedOption,
  onChange,
  showAnswer = false,
  correctAnswer,
  explanation
}) => {
  const handleOptionSelect = (option: string) => {
    if (onChange) {
      onChange(question._id, option);
    }
  };

  // Render specialized question cards based on question type
  if (question.questionType === 'Reading Comprehension') {
    return (
      <RCQuestionCard
        question={question}
        selectedAnswer={selectedOption}
        showAnswer={showAnswer}
        correctAnswer={correctAnswer}
        explanation={explanation}
        onAnswerSelect={onChange ? (option) => onChange(question._id, option) : undefined}
      />
    );
  }

  if (question.questionType === 'Critical Reasoning') {
    return (
      <CRQuestionCard
        question={question}
        selectedAnswer={selectedOption}
        showAnswer={showAnswer}
        correctAnswer={correctAnswer}
        explanation={explanation}
        onAnswerSelect={onChange ? (option) => onChange(question._id, option) : undefined}
      />
    );
  }

  if (question.questionType === 'Data Sufficiency') {
    return (
      <DSQuestionCard
        question={question}
        selectedAnswer={selectedOption}
        showAnswer={showAnswer}
        correctAnswer={correctAnswer}
        explanation={explanation}
        onAnswerSelect={onChange ? (option) => onChange(question._id, option) : undefined}
      />
    );
  }

  if (question.questionType === 'Problem Solving') {
    return (
      <PSQuestionCard
        question={question}
        selectedAnswer={selectedOption}
        showAnswer={showAnswer}
        correctAnswer={correctAnswer}
        explanation={explanation}
        onAnswerSelect={onChange ? (option) => onChange(question._id, option) : undefined}
      />
    );
  }

  // Default question card for other question types
  return (
    <div className="question-content">
      {/* Question text */}
      <div className="mb-5">
        <Text className="text-lg font-medium whitespace-pre-line">{question.questionText}</Text>
      </div>
      
      {/* Options */}
      <div className="space-y-3">
        {question.options.map((option: string, index: number) => {
          const optionLetter = String.fromCharCode(65 + index);
          const isSelected = selectedOption === option;
          const isCorrect = showAnswer && correctAnswer === option;
          
          return (
            <div 
              key={index}
              className={`flex items-start p-3 rounded-md transition-all duration-200 cursor-pointer ${
                isSelected 
                  ? 'bg-blue-100 border-2 border-blue-500 shadow-md transform scale-[1.01]' 
                  : 'bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-blue-300'
              } ${isCorrect ? 'ring-2 ring-green-500' : ''}`}
              onClick={() => handleOptionSelect(option)}
            >
              <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full mr-3 font-medium shadow ${
                isSelected 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700'
              } ${isCorrect ? 'bg-green-500 text-white' : ''}`}>
                {optionLetter}
              </div>
              <div className="flex-1">
                <Text className={`whitespace-pre-line ${isSelected ? 'font-medium text-blue-800' : ''}`}>{option}</Text>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Explanation */}
      {showAnswer && explanation && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <Text strong className="block mb-2 text-gray-700">Explanation:</Text>
            <Text className="whitespace-pre-line text-gray-600">{explanation}</Text>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionCard; 