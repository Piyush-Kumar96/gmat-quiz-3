import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getQuestionBag, deleteQuestionBagItem } from '../services/api';
import { Question } from '../types/quiz';
import { Button, Card, Typography, Space, Tag, Pagination, Collapse, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Panel } = Collapse;

// Use text labels instead of icons to avoid TypeScript errors
const EyeIcon: React.FC<{ visible: boolean }> = ({ visible }) => (
  <span className="mr-2">
    {visible ? '👁️' : '👁️'}
  </span>
);

// Custom DeleteIcon to avoid TypeScript errors
const DeleteIcon = () => (
  <span className="mr-2">
    <DeleteOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
  </span>
);

interface QueryParams {
  page: number;
  limit: number;
  category?: string;
  questionType?: string;
  difficulty?: number;
}

interface QuestionBagResponse {
  questions: Question[];
  total: number;
  page: number;
  totalPages: number;
}

const ReviewPage: React.FC = () => {
  const [queryParams, setQueryParams] = useState<QueryParams>({
    page: 1,
    limit: 10,
  });
  const [visibleAnswers, setVisibleAnswers] = useState<{ [key: string]: boolean }>({});
  const [isDeleting, setIsDeleting] = useState<{ [key: string]: boolean }>({});

  const queryClient = useQueryClient();

  // Use React Query for data fetching
  const { data, isLoading, error } = useQuery<QuestionBagResponse>({
    queryKey: ['questions', queryParams],
    queryFn: () => getQuestionBag(queryParams)
  });

  const toggleAnswer = (questionId: string) => {
    setVisibleAnswers(prev => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const handlePageChange = (page: number) => {
    setQueryParams(prev => ({ ...prev, page }));
    // Reset visible answers when changing pages
    setVisibleAnswers({});
    // Scroll to top
    window.scrollTo(0, 0);
  };

  // Delete question without confirmation
  const handleDelete = async (questionId: string) => {
    setIsDeleting(prev => ({ ...prev, [questionId]: true }));
    
    try {
      await deleteQuestionBagItem(questionId);
      
      // Show success message
      message.success('Question deleted successfully');
      
      // Invalidate the questions query to refetch the data
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    } catch (error) {
      console.error('Error deleting question:', error);
      message.error('Failed to delete question. Please try again.');
    } finally {
      setIsDeleting(prev => ({ ...prev, [questionId]: false }));
    }
  };

  // Define question renderer
  const renderQuestion = (question: Question) => (
    <Card className="shadow-sm hover:shadow-md transition-shadow border-0">
      <Space direction="vertical" size="middle" className="w-full">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Text strong>{question.questionText}</Text>
            <div className="mt-2 space-x-2">
              <Tag color="blue">{question.category}</Tag>
              <Tag color="green">{question.questionType}</Tag>
              <Tag color="orange">
                Difficulty: {['Easy', 'Medium', 'Hard'][question.difficulty - 1] || question.difficulty}
              </Tag>
            </div>
          </div>
          <Button 
            type="primary" 
            danger 
            icon={<DeleteIcon />} 
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(question._id);
            }}
            loading={isDeleting[question._id]}
            disabled={isDeleting[question._id]}
          >
            Delete
          </Button>
        </div>
        
        <div className="space-y-2 mt-4">
          {question.options.map((option: string, index: number) => (
            <div
              key={index}
              className={`p-3 rounded-lg transition-colors ${
                visibleAnswers[question._id] && option === question.correctAnswer
                  ? 'bg-green-100 border border-green-200'
                  : 'bg-gray-50 hover:bg-gray-100 border border-gray-100'
              }`}
            >
              {String.fromCharCode(65 + index)} {option}
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button
            type="primary"
            ghost
            onClick={(e) => {
              e.stopPropagation();
              toggleAnswer(question._id);
            }}
          >
            <span className="inline-flex items-center">
              <EyeIcon visible={visibleAnswers[question._id]} />
              {visibleAnswers[question._id] ? 'Hide Answer' : 'Show Answer'}
            </span>
          </Button>
        </div>

        {visibleAnswers[question._id] && question.explanation && (
          <div className="mt-2 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <Text strong className="block mb-2">Explanation:</Text>
            <Text>{question.explanation}</Text>
          </div>
        )}
      </Space>
    </Card>
  );

  // Filter options
  const filterOptions = {
    category: [
      { text: 'Quantitative', value: 'Quantitative' },
      { text: 'Verbal', value: 'Verbal' },
      { text: 'Integrated Reasoning', value: 'Integrated Reasoning' },
      { text: 'Analytical Writing', value: 'Analytical Writing' },
    ],
    questionType: [
      { text: 'Multiple Choice', value: 'Multiple Choice' },
      { text: 'Problem Solving', value: 'Problem Solving' },
      { text: 'Data Sufficiency', value: 'Data Sufficiency' },
      { text: 'Reading Comprehension', value: 'Reading Comprehension' },
      { text: 'Critical Reasoning', value: 'Critical Reasoning' },
      { text: 'Sentence Correction', value: 'Sentence Correction' },
    ],
    difficulty: [
      { text: 'Easy', value: 1 },
      { text: 'Medium', value: 2 },
      { text: 'Hard', value: 3 },
    ],
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <Title level={2}>Question Review</Title>
        {!isLoading && !error && data?.total !== undefined && (
          <div className="flex items-center">
            <Text strong className="text-lg">{data.total}</Text>
            <Text className="ml-2">Questions Found</Text>
          </div>
        )}
      </div>

      <div className="bg-gray-50 p-4 rounded-lg mb-6 shadow-sm">
        <div className="flex flex-row items-center space-x-4 flex-wrap">
          {Object.entries(filterOptions).map(([key, options]) => (
            <div key={key} className="flex items-center">
              <label className="mr-2 text-gray-600">{key.charAt(0).toUpperCase() + key.slice(1)}:</label>
              <select
                className="border rounded p-2"
                value={queryParams[key as keyof QueryParams]?.toString() || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setQueryParams(prev => ({
                    ...prev,
                    [key]: key === 'difficulty' ? (value ? parseInt(value) : undefined) : value,
                    page: 1, // Reset to first page when filter changes
                  }));
                  setVisibleAnswers({}); // Reset visible answers when filters change
                }}
              >
                <option value="">All</option>
                {options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.text}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Button
            onClick={() => {
              setQueryParams({ page: 1, limit: 10 });
              setVisibleAnswers({}); // Reset visible answers when clearing filters
            }}
            danger
            type="primary"
            className="hover:opacity-90 transition-opacity"
          >
            🗑️ Clear Filters
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading questions...</div>
      ) : error ? (
        <div className="text-center text-red-500 mt-4">
          Error loading questions. Please try again later.
        </div>
      ) : (
        <>
          {data?.questions && data.questions.length > 0 ? (
            <>
              <div className="space-y-6">
                {data.questions.map((question) => (
                  <div key={question._id} className="mb-6">
                    {renderQuestion(question)}
                  </div>
                ))}
              </div>

              <div className="flex justify-center mt-8 mb-4">
                <Pagination
                  current={queryParams.page}
                  pageSize={queryParams.limit}
                  total={data.total || 0}
                  onChange={handlePageChange}
                  showSizeChanger={false}
                  showQuickJumper
                  showTotal={(total) => `Total ${total} questions`}
                  className="flex items-center space-x-2"
                  itemRender={(page, type, originalElement) => {
                    if (type === 'page' && page === queryParams.page) {
                      return (
                        <div className="bg-blue-500 text-white rounded px-3 py-1 font-bold">
                          {page}
                        </div>
                      );
                    }
                    if (type === 'page') {
                      return (
                        <div className="px-3 py-1 hover:bg-gray-100 rounded">
                          {page}
                        </div>
                      );
                    }
                    return originalElement;
                  }}
                />
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              No questions found matching your filters.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReviewPage;