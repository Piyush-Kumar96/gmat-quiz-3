import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getQuiz, submitQuiz, getRandomQuestionsV2 } from '../services/api';
import { QuizItem, QuizConfig, QuizSubmission } from '../types';
import { Button, Card, Progress, Space, Modal, Alert, Badge, Typography } from 'antd';
import { 
  ArrowRightOutlined, 
  FlagOutlined, 
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import QuestionCard from '../components/QuestionCard';

const { Text, Title } = Typography;

// Icon components with required TypeScript props
const ClockIcon = () => (
  <span className="mr-2">
    <ClockCircleOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
  </span>
);

const ArrowRightIcon = () => (
  <span className="ml-2">
    <ArrowRightOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
  </span>
);

const FlagIcon = () => (
  <span className="mr-2">
    <FlagOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
  </span>
);

const CheckIcon = () => (
  <span className="ml-2">
    <CheckOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
  </span>
);

const WarningIcon = () => (
  <span className="text-yellow-500 text-xl mr-3 mt-1">
    <ExclamationCircleOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
  </span>
);

const TimerWarningIcon = () => (
  <span className="text-red-500 text-xl mr-3 mt-1">
    <ClockCircleOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
  </span>
);

export const QuizPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [questions, setQuestions] = useState<QuizItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [visitedQuestions, setVisitedQuestions] = useState<number[]>([0]); // Track visited questions
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [totalTimeSpent, setTotalTimeSpent] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [quizId, setQuizId] = useState<string | null>(null);

  // Get config from location state or use default
  const config: QuizConfig = location.state?.config || {
    count: 20,
    timeLimit: 30
  };

  // Load quiz questions
  useEffect(() => {
    const loadQuiz = async () => {
      try {
        setLoading(true);
        
        // Use the V2 function to get random questions from QuestionBagV2
        const data = await getRandomQuestionsV2(config.count, config.timeLimit, {
          category: config.category,
          questionType: config.questionType,
          difficulty: config.difficulty
        });
        
        setQuestions(data.questions);
        setTimeLeft(data.timeLimit * 60);
        setQuizId(data.quizId);
        setLoading(false);
      } catch (err) {
        setError('Failed to load quiz questions. Please try again later.');
        setLoading(false);
      }
    };

    loadQuiz();
  }, []);

  // Timer effect
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          // Show warning when 5 minutes left
          if (prev === 300) {
            setShowTimeWarning(true);
          }
          // Increment total time spent
          setTotalTimeSpent(current => current + 1);
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else if (timeLeft === 0 && questions.length > 0) {
      handleSubmit();
    }
  }, [timeLeft, questions.length]);

  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Handle answer selection
  const handleAnswerSelect = (answer: string) => {
    if (currentQuestionIndex < questions.length) {
      const questionId = questions[currentQuestionIndex]._id;
      setAnswers(prev => ({
        ...prev,
        [questionId]: answer
      }));
    }
  };

  // Toggle flag on current question
  const toggleFlag = () => {
    if (currentQuestionIndex < questions.length) {
      const questionId = questions[currentQuestionIndex]._id;
      
      if (flaggedQuestions.includes(questionId)) {
        setFlaggedQuestions(prev => prev.filter(id => id !== questionId));
      } else if (flaggedQuestions.length < 3) {
        setFlaggedQuestions(prev => [...prev, questionId]);
      }
    }
  };

  // Navigate to next question
  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      
      // Add to visited questions if not already visited
      if (!visitedQuestions.includes(nextIndex)) {
        setVisitedQuestions(prev => [...prev, nextIndex]);
      }
    }
  };

  // Calculate progress percentage
  const calculateProgress = (): number => {
    const answeredCount = Object.keys(answers).length;
    return Math.round((answeredCount / questions.length) * 100);
  };

  // Check if all questions are answered
  const allQuestionsAnswered = (): boolean => {
    return Object.keys(answers).length === questions.length;
  };

  // Handle quiz submission
  const handleSubmit = async () => {
    if (!quizId) {
      setError('Quiz ID is missing. Please restart the quiz.');
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('Submitting quiz answers:', { quizId, answers, timeSpent: totalTimeSpent });
      const submission = await submitQuiz(quizId, answers, totalTimeSpent);
      console.log('Received submission response:', submission);
      
      if (!submission || !submission.results) {
        throw new Error('Invalid response from server');
      }
      
      setIsSubmitting(false);
      navigate('/results', { state: { submission } });
    } catch (err) {
      console.error('Error submitting quiz:', err);
      setIsSubmitting(false);
      setError(
        err instanceof Error 
          ? `Failed to submit quiz: ${err.message}` 
          : 'Failed to submit quiz. Please try again later.'
      );
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading Quiz...</div>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert type="error" message="Error" description={error} showIcon />
        <div className="mt-4 text-center">
          <Button type="primary" onClick={() => navigate('/')}>
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert 
          type="warning" 
          message="No Questions Available" 
          description="There are no questions available for this quiz. Please try again with different settings or contact the administrator." 
          showIcon 
        />
        <div className="mt-4 text-center">
          <Button type="primary" onClick={() => navigate('/config')}>
            Back to Quiz Configuration
          </Button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const isCurrentQuestionFlagged = currentQuestion && flaggedQuestions.includes(currentQuestion._id);
  const currentAnswer = currentQuestion ? answers[currentQuestion._id] : undefined;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header with timer only */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">GMAT Quiz</h1>
          <div className="flex items-center bg-gray-100 px-4 py-2 rounded-lg">
            <ClockIcon />
            <span className={`text-lg font-medium ${timeLeft < 300 ? 'text-red-500 animate-pulse' : ''}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        {/* Question navigation */}
        <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
          <div className="text-gray-500 text-sm">
            <span>No going back to previous questions</span>
          </div>
          
          <div className="text-center font-medium">
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
          
          <Button 
            type="primary" 
            onClick={nextQuestion}
            disabled={currentQuestionIndex === questions.length - 1}
            className="flex items-center"
          >
            <span className="inline-flex items-center">
              Next Question <ArrowRightIcon />
            </span>
          </Button>
        </div>
      </div>

      {/* Current question card */}
      {currentQuestion && (
        <Card 
          className="shadow-md hover:shadow-lg transition-shadow border border-gray-200 rounded-lg overflow-hidden mb-8"
          bodyStyle={{ padding: 0 }}
        >
          {/* Question Header with metadata */}
          <div className="bg-gray-50 border-b border-gray-200 p-4">
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <div className="flex flex-wrap gap-2">
                  {currentQuestion.type && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                      {currentQuestion.type}
                    </span>
                  )}
                </div>
              </div>
              <Button 
                type={isCurrentQuestionFlagged ? "primary" : "default"}
                onClick={toggleFlag}
                disabled={!isCurrentQuestionFlagged && flaggedQuestions.length >= 3}
                danger={isCurrentQuestionFlagged}
                className="ml-2"
              >
                <span className="inline-flex items-center">
                  <FlagIcon />
                  {isCurrentQuestionFlagged ? "Unflag" : "Flag for Review"}
                </span>
              </Button>
            </div>
          </div>
          
          {/* Question Content */}
          <div className="p-5">
            <QuestionCard
              question={currentQuestion as any}
              selectedOption={currentAnswer}
              onChange={handleAnswerSelect}
            />
          </div>

          {/* Footer with navigation */}
          <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100 p-4 bg-gray-50">
            {!isLastQuestion ? (
              <Button 
                type="primary"
                onClick={nextQuestion}
                disabled={!currentAnswer}
                size="large"
                className="flex items-center"
              >
                <span className="inline-flex items-center">
                  Next Question <ArrowRightIcon />
                </span>
              </Button>
            ) : (
              <Button 
                type="primary"
                onClick={handleSubmit}
                size="large"
                className="flex items-center"
              >
                <span className="inline-flex items-center">
                  Submit Quiz <CheckIcon />
                </span>
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Progress indicators */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <div className="mb-2 font-medium">Question Status</div>
        <div className="grid grid-cols-10 gap-2 mb-4">
          {questions.map((question, index) => {
            const isAnswered = answers[question._id] !== undefined;
            const isFlagged = flaggedQuestions.includes(question._id);
            const isVisited = visitedQuestions.includes(index);
            const isCurrent = currentQuestionIndex === index;
            
            return (
              <div
                key={index}
                className={`h-8 rounded flex items-center justify-center text-xs font-bold ${
                  isCurrent 
                    ? 'bg-blue-500 text-white' 
                    : isAnswered 
                      ? 'bg-green-500 text-white' 
                      : isVisited 
                        ? 'bg-yellow-500 text-white' 
                        : 'bg-gray-200 text-gray-700'
                } ${isFlagged ? 'ring-2 ring-red-500' : ''}`}
              >
                {index + 1}
              </div>
            );
          })}
        </div>
        
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-500 rounded mr-2"></div>
            <span>Current</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
            <span>Answered</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-500 rounded mr-2"></div>
            <span>Visited</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-200 rounded mr-2"></div>
            <span>Not Visited</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-300 rounded mr-2 ring-2 ring-red-500"></div>
            <span>Flagged</span>
          </div>
        </div>
      </div>

      {/* Submit button */}
      <div className="bg-white shadow-md rounded-lg p-6 text-center">
        <p className="mb-4 text-gray-600">
          Ready to submit? You have answered {Object.keys(answers).length} out of {questions.length} questions.
        </p>
        <Button
          type="primary"
          size="large"
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          className="px-8"
        >
          <span className="inline-flex items-center">
            Submit Quiz <CheckIcon />
          </span>
        </Button>
      </div>

      {/* Time warning modal */}
      <Modal
        title={
          <div className="flex items-center text-red-600">
            <ClockCircleOutlined 
              className="mr-2"
              onPointerEnterCapture={() => {}}
              onPointerLeaveCapture={() => {}}
            />
            <span>Time Warning</span>
          </div>
        }
        open={showTimeWarning}
        onOk={() => setShowTimeWarning(false)}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="Continue"
        centered
        maskClosable={false}
        style={{ top: 20 }}
        bodyStyle={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
      >
        <div className="py-4">
          <div className="flex items-start">
            <TimerWarningIcon />
            <div>
              <p className="font-medium">You have 5 minutes remaining!</p>
              <p className="text-gray-600 mt-2">
                Please finish answering the remaining questions and submit your quiz.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};