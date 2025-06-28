import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Alert, Typography, Progress, Card, Modal } from 'antd';
import { 
  ClockCircleOutlined, 
  PlayCircleOutlined, 
  PauseCircleOutlined,
  CoffeeOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  CalculatorOutlined,
  FileTextOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { QuizConfig, GMATSection } from '../types';
import { Question } from '../types/quiz';
import { getRandomQuestionsV2, submitQuiz } from '../services/api';
import { analytics } from '../services/analytics';
import QuestionCard from '../components/QuestionCard';

const { Title, Text } = Typography;

interface GMATFocusState {
  currentSection: number;
  sectionsCompleted: boolean[];
  sectionResults: any[];
  isOnBreak: boolean;
  breakTimeLeft: number;
  totalTestTime: number;
}

interface SectionConfig {
  name: GMATSection;
  questionCount: number;
  timeLimit: number;
  questionTypes: string[];
  categories: string[];
  icon: React.ReactNode;
  color: string;
}

const GMATFocusQuizPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const config = location.state?.config as QuizConfig;

  // GMAT Focus State
  const [gmatState, setGmatState] = useState<GMATFocusState>({
    currentSection: 0,
    sectionsCompleted: [false, false, false],
    sectionResults: [],
    isOnBreak: false,
    breakTimeLeft: 600, // 10 minutes in seconds
    totalTestTime: 0
  });

  // Current Section Quiz State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Section Configurations
  const sectionConfigs: SectionConfig[] = [
    {
      name: 'Quantitative Reasoning',
      questionCount: 21,
      timeLimit: 45,
      questionTypes: ['Problem Solving'],
      categories: ['Quantitative Reasoning'],
      icon: <CalculatorOutlined onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined} />,
      color: '#1890ff'
    },
    {
      name: 'Verbal Reasoning', 
      questionCount: 23,
      timeLimit: 45,
      questionTypes: ['Reading Comprehension', 'Critical Reasoning'],
      categories: ['Verbal Reasoning'],
      icon: <FileTextOutlined onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined} />,
      color: '#52c41a'
    },
    {
      name: 'Data Insights',
      questionCount: 20,
      timeLimit: 45,
      questionTypes: ['Data Sufficiency'],
      categories: ['Data Insights'],
      icon: <BarChartOutlined onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined} />,
      color: '#722ed1'
    }
  ];

  // Get current section configuration
  const getCurrentSectionConfig = (): SectionConfig => {
    const sectionName = config.sectionOrder?.[gmatState.currentSection] || 'Quantitative Reasoning';
    return sectionConfigs.find(s => s.name === sectionName) || sectionConfigs[0];
  };

  // Load current section quiz
  const loadCurrentSection = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const currentSectionConfig = getCurrentSectionConfig();
      
      // Create section-specific quiz config
      const filters: any = {};
      
      // Set up filters for the specific section
      if (currentSectionConfig.questionTypes.length > 0) {
        filters.questionTypes = currentSectionConfig.questionTypes;
      }
      
      if (currentSectionConfig.categories.length > 0) {
        filters.categories = currentSectionConfig.categories;
      }

      console.log('Creating quiz for section:', currentSectionConfig.name, {
        count: currentSectionConfig.questionCount,
        timeLimit: currentSectionConfig.timeLimit,
        filters: filters
      });
      
      const quiz = await getRandomQuestionsV2(
        currentSectionConfig.questionCount, 
        currentSectionConfig.timeLimit, 
        filters
      );
      console.log('Created quiz:', quiz);
      
      if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        throw new Error(`No questions available for ${currentSectionConfig.name}`);
      }

      setQuizId(quiz.quizId);
      setQuestions(quiz.questions);
      setCurrentQuestionIndex(0);
      setAnswers({});
      setFlaggedQuestions([]);
      setTimeLeft(currentSectionConfig.timeLimit * 60); // Convert minutes to seconds
      setTotalTimeSpent(0);
      setIsPaused(false);
      
      // Track section started
      analytics.trackQuizStarted({
        quizId: quiz.quizId,
        count: currentSectionConfig.questionCount,
        timeLimit: currentSectionConfig.timeLimit
      });
      
    } catch (err) {
      console.error('Error loading section:', err);
      setError(
        err instanceof Error 
          ? `Failed to load ${getCurrentSectionConfig().name}: ${err.message}`
          : `Failed to load ${getCurrentSectionConfig().name}. Please try again.`
      );
    } finally {
      setLoading(false);
    }
  }, [gmatState.currentSection, config.sectionOrder]);

  // Initialize quiz when component mounts or section changes
  useEffect(() => {
    if (!config || !config.isGmatFocus) {
      navigate('/config');
      return;
    }
    
    if (!gmatState.isOnBreak) {
      loadCurrentSection();
    }
  }, [config, gmatState.currentSection, gmatState.isOnBreak, loadCurrentSection, navigate]);

  // Timer effect for current section
  useEffect(() => {
    if (loading || isPaused || gmatState.isOnBreak) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time's up for this section
          handleSectionComplete();
          return 0;
        }
        return prev - 1;
      });
      
      setTotalTimeSpent(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, isPaused, gmatState.isOnBreak]);

  // Break timer effect
  useEffect(() => {
    if (!gmatState.isOnBreak) return;

    const timer = setInterval(() => {
      setGmatState(prev => ({
        ...prev,
        breakTimeLeft: Math.max(0, prev.breakTimeLeft - 1)
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [gmatState.isOnBreak]);

  // Format time helper
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle answer selection
  const handleAnswerSelect = (answer: string) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setAnswers(prev => ({
      ...prev,
      [currentQuestion._id]: answer
    }));
  };

  // Navigate to next question
  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  // Navigate to previous question
  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  // Toggle question flag
  const toggleFlag = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setFlaggedQuestions(prev => 
      prev.includes(currentQuestion._id)
        ? prev.filter(id => id !== currentQuestion._id)
        : [...prev, currentQuestion._id]
    );
  };

  // Handle section completion
  const handleSectionComplete = async () => {
    if (!quizId) return;

    setIsSubmitting(true);
    
    try {
      // Submit current section
      const submission = await submitQuiz(quizId, answers, totalTimeSpent);
      
      const currentSectionConfig = getCurrentSectionConfig();
      const sectionResult = {
        sectionIndex: gmatState.currentSection,
        sectionName: currentSectionConfig.name,
        submission: submission,
        timeSpent: totalTimeSpent,
        questionCount: questions.length,
        answers: answers
      };

      // Update GMAT state
      const newSectionsCompleted = [...gmatState.sectionsCompleted];
      newSectionsCompleted[gmatState.currentSection] = true;
      
      const newSectionResults = [...gmatState.sectionResults, sectionResult];
      
      setGmatState(prev => ({
        ...prev,
        sectionsCompleted: newSectionsCompleted,
        sectionResults: newSectionResults,
        totalTestTime: prev.totalTestTime + totalTimeSpent
      }));

      // Check if all sections are complete
      const nextSectionIndex = gmatState.currentSection + 1;
      if (nextSectionIndex >= 3) {
        // All sections complete - go to results
        navigate('/results', {
          state: {
            isGmatFocus: true,
            gmatResults: {
              sectionResults: newSectionResults,
              totalTime: gmatState.totalTestTime + totalTimeSpent,
              sectionOrder: config.sectionOrder
            }
          }
        });
        return;
      }

      // Check if break should be offered
      if (config.breakAfterSection === nextSectionIndex) {
        setGmatState(prev => ({
          ...prev,
          isOnBreak: true,
          breakTimeLeft: 600 // Reset to 10 minutes
        }));
      } else {
        // Move to next section
        setGmatState(prev => ({
          ...prev,
          currentSection: nextSectionIndex
        }));
      }

    } catch (err) {
      console.error('Error completing section:', err);
      setError('Failed to complete section. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // End break early
  const endBreakEarly = () => {
    setGmatState(prev => ({
      ...prev,
      isOnBreak: false,
      currentSection: prev.currentSection + 1
    }));
  };

  // Render break screen
  if (gmatState.isOnBreak) {
    const nextSectionConfig = sectionConfigs.find(s => 
      s.name === config.sectionOrder?.[gmatState.currentSection + 1]
    );

    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center">
        <Card className="max-w-2xl w-full mx-4">
          <div className="text-center">
            <CoffeeOutlined 
              className="text-6xl text-orange-500 mb-4" 
              onPointerEnterCapture={undefined} 
              onPointerLeaveCapture={undefined} 
            />
            <Title level={2} className="mb-4">Break Time</Title>
            <Text className="text-lg text-gray-600 block mb-6">
              You've completed Section {gmatState.currentSection + 1}. Take a well-deserved break!
            </Text>
            
            <div className="bg-orange-100 rounded-lg p-6 mb-6">
              <div className="text-4xl font-bold text-orange-600 mb-2">
                {formatTime(gmatState.breakTimeLeft)}
              </div>
              <Text className="text-orange-700">Time remaining</Text>
            </div>

            {nextSectionConfig && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <Text className="text-gray-600 block mb-2">Next up:</Text>
                <div className="flex items-center justify-center">
                  <span className="text-2xl mr-2" style={{ color: nextSectionConfig.color }}>
                    {nextSectionConfig.icon}
                  </span>
                  <Title level={4} className="mb-0">{nextSectionConfig.name}</Title>
                </div>
                <Text className="text-gray-600">
                  {nextSectionConfig.questionCount} questions • {nextSectionConfig.timeLimit} minutes
                </Text>
              </div>
            )}

            <div className="space-x-4">
              <Button 
                type="primary" 
                size="large"
                onClick={endBreakEarly}
                className="bg-green-500 hover:bg-green-600 border-green-500"
              >
                End Break Early
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Render loading state
  if (loading) {
    const currentSectionConfig = getCurrentSectionConfig();
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-lg w-full mx-4">
          <div className="text-center">
            <div className="text-4xl mb-4" style={{ color: currentSectionConfig.color }}>
              {currentSectionConfig.icon}
            </div>
            <Title level={3} className="mb-4">Loading {currentSectionConfig.name}</Title>
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <Text className="text-gray-600">
              Preparing {currentSectionConfig.questionCount} questions...
            </Text>
          </div>
        </Card>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert type="error" message="Error" description={error} showIcon />
        <div className="mt-4 text-center">
          <Button type="primary" onClick={() => navigate('/config')}>
            Return to Configuration
          </Button>
        </div>
      </div>
    );
  }

  // Render main quiz interface
  const currentQuestion = questions[currentQuestionIndex];
  const currentSectionConfig = getCurrentSectionConfig();
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const overallProgress = ((gmatState.currentSection * 100) + (progress / 3)) / 3;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 sticky top-0 z-40">
        {/* GMAT Focus Header */}
        <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h2 className="text-lg font-bold text-purple-800 flex items-center">
                <RocketOutlined 
                  className="mr-2" 
                  onPointerEnterCapture={undefined} 
                  onPointerLeaveCapture={undefined} 
                />
                GMAT Focus Edition Mock Test
              </h2>
              <p className="text-sm text-purple-600">
                Section {gmatState.currentSection + 1} of 3: {currentSectionConfig.name}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-600">Overall Progress</div>
              <div className="text-lg font-bold text-purple-700">
                {Math.round(overallProgress)}%
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            {config.sectionOrder?.map((sectionName, index) => {
              const sectionConfig = sectionConfigs.find(s => s.name === sectionName);
              const isCompleted = gmatState.sectionsCompleted[index];
              const isCurrent = index === gmatState.currentSection;
              
              return (
                <div 
                  key={sectionName}
                  className={`p-2 rounded-lg ${
                    isCompleted ? 'bg-green-100 text-green-800' :
                    isCurrent ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-600'
                  }`}
                >
                  <div className="text-lg mb-1">
                    {isCompleted ? (
                      <CheckCircleOutlined 
                        onPointerEnterCapture={undefined} 
                        onPointerLeaveCapture={undefined} 
                      />
                    ) : (
                      sectionConfig?.icon
                    )}
                  </div>
                  <div className="text-xs font-medium">{sectionName}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section Progress and Timer */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <span className="text-lg font-semibold">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
            <Progress 
              percent={progress} 
              showInfo={false} 
              strokeColor={currentSectionConfig.color}
              className="w-32"
            />
          </div>
          
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 ${timeLeft < 300 ? 'text-red-600' : 'text-gray-700'}`}>
              <ClockCircleOutlined 
                onPointerEnterCapture={undefined} 
                onPointerLeaveCapture={undefined} 
              />
              <span className="font-mono text-lg font-semibold">
                {formatTime(timeLeft)}
              </span>
            </div>
            
            <Button
              type="default"
              icon={isPaused ? (
                <PlayCircleOutlined 
                  onPointerEnterCapture={undefined} 
                  onPointerLeaveCapture={undefined} 
                />
              ) : (
                <PauseCircleOutlined 
                  onPointerEnterCapture={undefined} 
                  onPointerLeaveCapture={undefined} 
                />
              )}
              onClick={() => setIsPaused(!isPaused)}
              disabled={isSubmitting}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Flagged: {flaggedQuestions.length} | Answered: {Object.keys(answers).length}/{questions.length}
          </div>
        </div>
      </div>

      {/* Question */}
      {currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          selectedOption={answers[currentQuestion._id]}
          onChange={(questionId, option) => handleAnswerSelect(option)}
          showAnswer={false}
        />
      )}

      {/* Navigation */}
      <div className="bg-white rounded-lg shadow-md p-6 mt-6">
        <div className="flex justify-between items-center">
          <Button
            size="large"
            onClick={prevQuestion}
            disabled={currentQuestionIndex === 0}
          >
            Previous
          </Button>

          <div className="text-center">
            <Text className="text-gray-600">
              {currentQuestionIndex === questions.length - 1 
                ? 'Ready to complete this section?' 
                : `${questions.length - currentQuestionIndex - 1} questions remaining`
              }
            </Text>
          </div>

          {currentQuestionIndex === questions.length - 1 ? (
            <Button
              type="primary"
              size="large"
              onClick={handleSectionComplete}
              loading={isSubmitting}
              className="bg-green-600 hover:bg-green-700 border-green-600"
            >
              Complete Section
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              onClick={nextQuestion}
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GMATFocusQuizPage; 