import React from 'react';
import { Card, Typography, Space, Divider } from 'antd';
import '../styles/question-cards.css';
const { Title, Text, Paragraph } = Typography;

interface CRQuestionCardProps {
  question: {
    _id: string;
    questionText: string;
    options: string[];
    passageText?: string; // For CR, this contains the argument
  };
  selectedAnswer?: string;
  showAnswer?: boolean;
  correctAnswer?: string;
  explanation?: string;
  onAnswerSelect?: (answer: string) => void;
}

export const CRQuestionCard: React.FC<CRQuestionCardProps> = ({
  question,
  selectedAnswer,
  showAnswer = false,
  correctAnswer,
  explanation,
  onAnswerSelect,
}) => {
  return (
    <div className="cr-question-card">
      {/* Argument Section */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg border-l-4 border-blue-500">
        <Title level={5} className="text-blue-700 mb-2">Argument</Title>
        <Paragraph>
          <div dangerouslySetInnerHTML={{ __html: question.passageText || '' }} />
        </Paragraph>
      </div>

      {/* Question Section */}
      <div className="mb-4">
        <Title level={5} className="mb-2">Question</Title>
        <Text strong>{question.questionText}</Text>
      </div>

      <Divider className="my-4" />

      {/* Options Section */}
      <div className="space-y-3">
        {question.options.map((option, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
              selectedAnswer === option
                ? 'border-2 border-blue-500 bg-blue-100 shadow-md transform scale-[1.01]'
                : showAnswer && option === correctAnswer
                ? 'border-2 border-green-500 bg-green-50'
                : 'border border-gray-200 hover:border-blue-300 hover:bg-gray-100'
            }`}
            onClick={() => onAnswerSelect && onAnswerSelect(option)}
          >
            <div className="flex items-start">
              <div className={`w-6 h-6 flex items-center justify-center rounded-full mr-3 shadow ${
                selectedAnswer === option
                  ? 'bg-blue-600 text-white'
                  : showAnswer && option === correctAnswer
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}>
                {String.fromCharCode(65 + index)}
              </div>
              <div className={selectedAnswer === option ? 'font-medium text-blue-800' : ''}>{option}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Explanation Section */}
      {showAnswer && explanation && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <Text strong>Explanation:</Text>
          <Paragraph className="mt-2">{explanation}</Paragraph>
        </div>
      )}
    </div>
  );
}; 