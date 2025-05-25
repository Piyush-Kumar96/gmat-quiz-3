import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QuizSubmission } from '../types';
import { Card, Button, Tag, Divider, Typography } from 'antd';

const { Title, Text, Paragraph } = Typography;

export const ResultsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const submission = location.state?.submission as QuizSubmission;

  // Count question types
  const getQuestionTypeCounts = () => {
    if (!submission?.results) return {};
    
    const typeCounts: Record<string, { total: number, correct: number }> = {};
    
    submission.results.forEach(result => {
      // Try to extract question type from the explanation if available
      let type = 'Unknown';
      if (result.explanation) {
        // Look for common pattern like "This is a [Critical Reasoning] question"
        const match = result.explanation.match(/This is an? ([^.]+) question/i) || 
                     result.explanation.match(/This ([^.]+) question/i);
        if (match) {
          type = match[1].trim();
        }
      }
      
      if (!typeCounts[type]) {
        typeCounts[type] = { total: 0, correct: 0 };
      }
      
      typeCounts[type].total += 1;
      if (result.isCorrect) {
        typeCounts[type].correct += 1;
      }
    });
    
    return typeCounts;
  };

  if (!submission) {
    return (
      <div className="text-center p-8">
        <Title level={2}>No submission data found</Title>
        <Paragraph>
          There was an issue retrieving your quiz results. This might happen if you accessed this page directly.
        </Paragraph>
        <Button type="primary" onClick={() => navigate('/')} className="mt-4">
          Start New Quiz
        </Button>
      </div>
    );
  }

  const questionTypes = getQuestionTypeCounts();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="mb-8 text-center">
        <Title level={2}>Quiz Results</Title>
        <div className="text-5xl font-bold text-blue-600 mb-2">
          {submission.percentage.toFixed(1)}%
        </div>
        <Text className="text-lg">
          You got <strong>{submission.score}</strong> out of <strong>{submission.total}</strong> questions correct
        </Text>
      </Card>

      {/* Question type statistics */}
      <Card className="mb-8" title="Performance by Question Type">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(questionTypes).map(([type, stats]) => (
            <div key={type} className="flex justify-between items-center p-3 border rounded">
              <Text strong>{type}</Text>
              <div>
                <Tag color={stats.correct === stats.total ? "success" : "warning"}>
                  {stats.correct}/{stats.total} correct
                </Tag>
                <Tag color="blue">
                  {((stats.correct / stats.total) * 100).toFixed(0)}%
                </Tag>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Title level={3} className="mb-4">Question Review</Title>
      
      <div className="space-y-6">
        {submission.results.map((result, index) => (
          <Card 
            key={result.questionId}
            className={`${result.isCorrect ? 'border-green-500' : 'border-red-500'} border-t-4`}
            title={
              <div className="flex justify-between items-center">
                <span>Question {index + 1}</span>
                <Tag color={result.isCorrect ? "success" : "error"}>
                  {result.isCorrect ? 'Correct' : 'Incorrect'}
                </Tag>
              </div>
            }
          >
            <div className="mb-4">
              <div className="flex flex-col md:flex-row md:justify-between mb-2">
                <div className="mb-2 md:mb-0">
                  <Text strong>Your answer: </Text>
                  <Tag color={result.isCorrect ? "success" : "default"}>
                    {result.userAnswer}
                  </Tag>
                </div>
                
                {!result.isCorrect && (
                  <div>
                    <Text strong>Correct answer: </Text>
                    <Tag color="success">{result.correctAnswer}</Tag>
                  </div>
                )}
              </div>
              
              <Divider className="my-3" />
              
              {result.explanation && (
                <div>
                  <Text strong>Explanation:</Text>
                  <Paragraph className="mt-1">{result.explanation}</Paragraph>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Button type="primary" size="large" onClick={() => navigate('/')} className="mr-4">
          Start New Quiz
        </Button>
        <Button onClick={() => window.print()}>Print Results</Button>
      </div>
    </div>
  );
}; 