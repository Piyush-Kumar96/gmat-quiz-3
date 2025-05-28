import React from 'react';
import { Card, Typography, Space, Button, Divider, Collapse } from 'antd';
import '../styles/question-cards.css';
const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface RCQuestionCardProps {
  question: {
    _id: string;
    questionText: string;
    options: string[];
    passageText?: string;
    rcNumber?: string;
  };
  selectedAnswer?: string;
  showAnswer?: boolean;
  correctAnswer?: string;
  explanation?: string;
  onAnswerSelect?: (answer: string) => void;
  isMobile?: boolean;
}

export const RCQuestionCard: React.FC<RCQuestionCardProps> = ({
  question,
  selectedAnswer,
  showAnswer = false,
  correctAnswer,
  explanation,
  onAnswerSelect,
  isMobile = false,
}) => {
  const [activeTab, setActiveTab] = React.useState<string>('passage');

  // Handle mobile view tab switching
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  return (
    <div className="rc-question-card">
      {/* Mobile View */}
      {isMobile && (
        <div className="mb-4">
          <div className="flex border-b">
            <div
              className={`px-4 py-2 cursor-pointer ${
                activeTab === 'passage' ? 'border-b-2 border-blue-500 font-semibold' : 'text-gray-500'
              }`}
              onClick={() => handleTabChange('passage')}
            >
              Passage
            </div>
            <div
              className={`px-4 py-2 cursor-pointer ${
                activeTab === 'question' ? 'border-b-2 border-blue-500 font-semibold' : 'text-gray-500'
              }`}
              onClick={() => handleTabChange('question')}
            >
              Question
            </div>
          </div>

          {activeTab === 'passage' && (
            <div className="p-4 bg-gray-50 rounded-lg mt-2 overflow-auto max-h-[60vh]">
              <Paragraph>
                <div dangerouslySetInnerHTML={{ __html: question.passageText || '' }} />
              </Paragraph>
            </div>
          )}

          {activeTab === 'question' && (
            <div className="mt-2">
              <div className="p-4 bg-white rounded-lg">
                <Text strong>{question.questionText}</Text>
                
                <div className="mt-4 space-y-3">
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

                {showAnswer && explanation && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <Text strong>Explanation:</Text>
                    <Paragraph className="mt-2">{explanation}</Paragraph>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Desktop View - Two-column layout */}
      {!isMobile && (
        <div className="flex flex-row space-x-4">
          {/* Left column: Passage */}
          <div className="w-1/2 bg-gray-50 p-4 rounded-lg overflow-auto max-h-[80vh]">
            <Title level={5} className="mb-3">Reading Passage</Title>
            <Paragraph>
              <div dangerouslySetInnerHTML={{ __html: question.passageText || '' }} />
            </Paragraph>
          </div>

          {/* Right column: Question and answers */}
          <div className="w-1/2">
            <div className="p-4 bg-white rounded-lg">
              <Text strong>{question.questionText}</Text>
              
              <div className="mt-4 space-y-3">
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

              {showAnswer && explanation && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <Text strong>Explanation:</Text>
                  <Paragraph className="mt-2">{explanation}</Paragraph>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 