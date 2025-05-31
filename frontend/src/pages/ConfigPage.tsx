import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { QuizConfig } from '../types';
import { 
  Card, 
  Select, 
  InputNumber, 
  Button, 
  Form, 
  Divider, 
  Tag, 
  Typography, 
  Radio, 
  Tooltip, 
  Popover, 
  Collapse,
  Alert,
  Row,
  Col,
  Steps
} from 'antd';
import { 
  SettingOutlined, 
  ClockCircleOutlined, 
  OrderedListOutlined, 
  TagsOutlined, 
  BarChartOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
  DownOutlined,
  ExperimentOutlined,
  ReadOutlined,
  ApartmentOutlined,
  RightOutlined,
  FileTextOutlined,
  BookOutlined,
  CheckCircleFilled
} from '@ant-design/icons';

const { Option } = Select;
const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;
const { Step } = Steps;

// Icon components with required TypeScript props
const SettingIcon = () => (
  <SettingOutlined className="mr-2 text-blue-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const ClockIcon = () => (
  <ClockCircleOutlined className="mr-2 text-blue-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const ListIcon = () => (
  <OrderedListOutlined className="mr-2 text-blue-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const TagIcon = () => (
  <TagsOutlined className="mr-2 text-green-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const ChartIcon = () => (
  <BarChartOutlined className="mr-2 text-orange-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const CategoryIcon = () => (
  <TagsOutlined className="mr-2 text-purple-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const PlayIcon = () => (
  <PlayCircleOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const InfoIcon = () => (
  <InfoCircleOutlined className="text-gray-400 ml-1" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const ExamIcon = () => (
  <FileTextOutlined className="mr-2 text-indigo-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const MockTestIcon = () => (
  <BookOutlined className="mr-2 text-purple-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const SectionalTestIcon = () => (
  <ApartmentOutlined className="mr-2 text-green-500" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const RightArrowIcon = () => (
  <RightOutlined onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

const CheckIcon = () => (
  <CheckCircleFilled className="text-green-500 mr-2" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
);

export const ConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [config, setConfig] = useState<QuizConfig>({
    count: 20,
    timeLimit: 30,
    questionTypeMode: 'balanced',
    difficultyMode: 'mixed',
    categoryMode: 'mixed'
  });
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(['1']); // Start with Practice Exams expanded
  const redirectMessage = location.state?.message;

  // Load available question types and categories
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        // In a real implementation, these would be API calls
        // For now, we'll hard-code the common GMAT question types and categories
        setQuestionTypes([
          'Reading Comprehension',
          'Critical Reasoning',
          'Data Sufficiency',
          'Problem Solving'
        ]);
        
        setCategories([
          'Quantitative Reasoning',
          'Verbal Reasoning',
          'Data Insights'
        ]);
      } catch (error) {
        console.error('Error loading filter options:', error);
      }
    };
    
    loadFilterOptions();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Navigate to quiz with the selected configuration
    navigate('/quiz', { state: { config } });
  };
  
  const handleMockTest = () => {
    setLoading(true);
    navigate('/quiz', { state: { config: {
      count: 35,
      timeLimit: 65,
      questionTypeMode: 'balanced',
      difficultyMode: 'mixed',
      categoryMode: 'mixed',
      isMockTest: true
    }}});
  };
  
  const handleSectionalTest = (section: string) => {
    setLoading(true);
    const sectionConfig = {
      count: section === 'quant' ? 20 : 18,
      timeLimit: section === 'quant' ? 35 : 30,
      questionTypeMode: 'specific',
      selectedQuestionTypes: section === 'quant' 
        ? ['Data Sufficiency', 'Problem Solving'] 
        : ['Reading Comprehension', 'Critical Reasoning'],
      difficultyMode: 'mixed',
      categoryMode: 'specific',
      selectedCategories: [section === 'quant' ? 'Quantitative Reasoning' : 'Verbal Reasoning'],
      isSectionalTest: true,
      sectionName: section === 'quant' ? 'Quantitative Reasoning' : 'Verbal Reasoning'
    };
    
    navigate('/quiz', { state: { config: sectionConfig }});
  };

  return (
    <div className="container mx-auto px-4 py-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <Title level={2} className="text-center mb-8">GMAT Quiz Platform</Title>
        
        {redirectMessage && (
          <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-md">
            <Text className="text-blue-700">{redirectMessage}</Text>
          </div>
        )}
        
        {/* Practice Exams Section */}
        <Card
          className="mb-8 rounded-lg overflow-hidden shadow-md border-0" 
          title={
            <div className="flex items-center py-2">
              <ExamIcon />
              <span className="text-lg font-semibold text-indigo-700">Practice Exams</span>
            </div>
          }
          headStyle={{ backgroundColor: '#f5f7ff', borderBottom: '1px solid #e6e8f0' }}
          bodyStyle={{ padding: '24px' }}
        >
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-5 flex items-start">
            <InfoCircleOutlined className="text-blue-500 mt-1 mr-2" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} />
            <div>
              <Text strong className="text-blue-700 block mb-1">GMAT Focus Edition Practice Tests</Text>
              <Text className="text-blue-600 text-sm">Currently, only Data Sufficiency questions are fully available for Data Insights. Additional question types coming soon.</Text>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mock Test Card */}
            <div className="bg-gradient-to-br from-indigo-50 to-white rounded-lg border border-indigo-100 shadow-sm overflow-hidden">
              <div className="bg-gray-600 text-white px-4 py-2 flex items-center">
                <MockTestIcon />
                <span className="font-medium ml-1">Mock Test</span>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2 mb-3">
                  <Tag color="blue" className="px-2 py-1 text-xs">35 Questions</Tag>
                  <Tag color="green" className="px-2 py-1 text-xs">65 Minutes</Tag>
                  <Tag color="orange" className="px-2 py-1 text-xs">All Sections</Tag>
                </div>
                <Button 
                  type="primary"
                  onClick={handleMockTest}
                  className="w-full bg-blue-500 hover:bg-blue-600 border-0 h-10 text-white shadow-md hover:shadow-lg transition-all rounded-lg"
                >
                  Start Mock Test
                </Button>
              </div>
            </div>
            
            {/* Sectional Tests Card */}
            <div className="bg-gradient-to-br from-purple-50 to-white rounded-lg border border-purple-100 shadow-sm overflow-hidden">
              <div className="bg-gray-600 text-white px-4 py-2 flex items-center">
                <SectionalTestIcon />
                <span className="font-medium ml-1">Sectional Tests</span>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {/* Quant Section */}
                  <div className="bg-blue-50 rounded p-2 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Text strong className="text-blue-700 text-sm">Quantitative</Text>
                      <div className="flex gap-1 mt-1">
                        <Tag color="blue" className="px-1 py-0 text-xs">20 Q</Tag>
                        <Tag color="cyan" className="px-1 py-0 text-xs">35 Min</Tag>
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleSectionalTest('quant')}
                      className="bg-blue-500 hover:bg-blue-600 border-0 text-white shadow-md hover:shadow-lg transition-all h-9 px-4 rounded-lg"
                    >
                      Start
                    </Button>
                  </div>
                  
                  {/* Verbal Section */}
                  <div className="bg-green-50 rounded p-2 border border-green-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Text strong className="text-green-700 text-sm">Verbal</Text>
                      <div className="flex gap-1 mt-1">
                        <Tag color="green" className="px-1 py-0 text-xs">18 Q</Tag>
                        <Tag color="cyan" className="px-1 py-0 text-xs">30 Min</Tag>
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleSectionalTest('verbal')}
                      className="bg-blue-500 hover:bg-blue-600 border-0 text-white shadow-md hover:shadow-lg transition-all h-9 px-4 rounded-lg"
                    >
                      Start
                    </Button>
                  </div>
                  
                  {/* Data Insights Section */}
                  <div className="bg-gray-50 rounded p-2 border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Text strong className="text-gray-500 text-sm">Data Insights</Text>
                      <div className="flex gap-1 mt-1">
                        <Tag color="default" className="px-1 py-0 text-xs">10 Q</Tag>
                        <Tag color="default" className="px-1 py-0 text-xs">20 Min</Tag>
                      </div>
                    </div>
                    <Tooltip title="Coming soon - Currently in development">
                      <Button 
                        disabled
                        className="bg-gray-100 text-gray-400 h-9 px-4 rounded-lg"
                      >
                        Soon
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
        
        {/* Customize Quiz Section */}
        <Card
          className="mb-8 rounded-lg overflow-hidden shadow-md border-0" 
          title={
            <div className="flex items-center py-2">
              <SettingIcon />
              <span className="text-lg font-semibold text-blue-700">Custom Quiz</span>
            </div>
          }
          headStyle={{ backgroundColor: '#f5f8ff', borderBottom: '1px solid #e6e8f0' }}
          bodyStyle={{ padding: '24px' }}
        >
          <div className="grid grid-cols-4 gap-1 mb-5">
            <div className="flex items-center justify-center bg-blue-50 px-2 py-1.5 rounded border border-blue-100 text-blue-600 text-xs sm:text-sm">
              <ClockIcon /> <span className="ml-1 hidden sm:inline">Basic Settings</span>
            </div>
            <div className="flex items-center justify-center bg-green-50 px-2 py-1.5 rounded border border-green-100 text-green-600 text-xs sm:text-sm">
              <TagIcon /> <span className="ml-1 hidden sm:inline">Question Types</span>
            </div>
            <div className="flex items-center justify-center bg-orange-50 px-2 py-1.5 rounded border border-orange-100 text-orange-600 text-xs sm:text-sm">
              <ChartIcon /> <span className="ml-1 hidden sm:inline">Difficulty</span>
            </div>
            <div className="flex items-center justify-center bg-purple-50 px-2 py-1.5 rounded border border-purple-100 text-purple-600 text-xs sm:text-sm">
              <CategoryIcon /> <span className="ml-1 hidden sm:inline">Category</span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Quiz Settings */}
            <Card className="rounded-xl border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white">
              <div className="flex items-center mb-6">
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white mr-3">1</div>
                <Text strong className="text-lg text-blue-700">Basic Settings</Text>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-5 rounded-lg border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-base font-medium text-blue-700 flex items-center">
                      <ListIcon />
                      Number of Questions
                    </label>
                    <Tooltip title="Choose how many questions to include in your quiz">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                  <InputNumber
                    min={5}
                    max={50}
                    value={config.count}
                    onChange={(value) => setConfig(prev => ({ ...prev, count: value as number }))}
                    className="w-full"
                    size="large"
                    controls={{ upIcon: '▲', downIcon: '▼' }}
                  />
                  <Text className="text-xs text-gray-500 mt-2 block">
                    Recommended: 20-30 questions for a balanced test
                  </Text>
                </div>

                <div className="bg-white p-5 rounded-lg border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-base font-medium text-blue-700 flex items-center">
                      <ClockIcon />
                      Time Limit (minutes)
                    </label>
                    <Tooltip title="Set how much time you'll have to complete the quiz">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                  <InputNumber
                    min={5}
                    max={180}
                    value={config.timeLimit}
                    onChange={(value) => setConfig(prev => ({ ...prev, timeLimit: value as number }))}
                    className="w-full"
                    size="large"
                    controls={{ upIcon: '▲', downIcon: '▼' }}
                  />
                  <Text className="text-xs text-gray-500 mt-2 block">
                    Official GMAT timing: ~2 minutes per question
                  </Text>
                </div>
              </div>
            </Card>
            
            {/* Question Type Settings */}
            <Card className="rounded-xl border-0 shadow-sm bg-gradient-to-br from-green-50 to-white">
              <div className="flex items-center mb-6">
                <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center text-white mr-3">2</div>
                <Text strong className="text-lg text-green-700">Question Types</Text>
              </div>
              
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <Text className="text-base font-medium text-green-700">Choose how to select question types</Text>
                  <Tooltip title="Balanced mix gives you a representative sample of all GMAT questions">
                    <InfoIcon />
                  </Tooltip>
                </div>
                <Radio.Group
                  value={config.questionTypeMode || 'balanced'}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    questionTypeMode: e.target.value,
                    // Clear specific question type if switching to balanced mode
                    questionType: e.target.value === 'balanced' ? undefined : prev.questionType,
                    selectedQuestionTypes: e.target.value === 'balanced' ? undefined : prev.selectedQuestionTypes
                  }))}
                  buttonStyle="solid"
                  size="large"
                  className="w-full flex"
                >
                  <Radio.Button value="balanced" className="flex-1 text-center font-medium">
                    Balanced Mix
                  </Radio.Button>
                  <Radio.Button value="specific" className="flex-1 text-center font-medium">
                    Specific Type
                  </Radio.Button>
                </Radio.Group>
              </div>
              
              {config.questionTypeMode === 'specific' && (
                <div className="bg-white p-6 rounded-lg border border-green-200 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-base font-medium text-green-700">
                      Select Question Type(s)
                    </label>
                    <Tooltip title="Choose one or more question types to focus on">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {questionTypes.map(type => {
                      // Check if this type is in the selected types array
                      const isSelected = config.selectedQuestionTypes?.includes(type) || config.questionType === type;
                      
                      return (
                        <div
                          key={type}
                          className={`p-4 rounded-lg cursor-pointer transition-all flex items-center ${
                            isSelected 
                              ? 'bg-green-100 border border-green-300 shadow-md' 
                              : 'bg-gray-50 border border-gray-200 hover:border-green-300 hover:bg-green-50'
                          }`}
                          onClick={() => {
                            // Handle multi-select logic
                            const currentSelected = config.selectedQuestionTypes || [];
                            let newSelected: string[];
                            
                            if (currentSelected.includes(type)) {
                              // Remove if already selected
                              newSelected = currentSelected.filter((t: string) => t !== type);
                            } else {
                              // Add if not selected
                              newSelected = [...currentSelected, type];
                            }
                            
                            setConfig(prev => ({ 
                              ...prev, 
                              questionType: undefined, // Clear the single selection
                              selectedQuestionTypes: newSelected 
                            }));
                          }}
                        >
                          {isSelected && <CheckIcon />}
                          <span className={`${isSelected ? 'font-medium text-green-800' : 'text-gray-700'}`}>{type}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {config.questionTypeMode === 'balanced' && (
                <div className="bg-white p-5 rounded-lg border border-green-200 shadow-md">
                  <div className="flex items-center mb-3">
                    <CheckIcon />
                    <Text strong className="text-green-700">A balanced mix of question types will be included:</Text>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    <Tag color="blue" className="px-3 py-2 text-center shadow-sm">30% Reading Comprehension</Tag>
                    <Tag color="cyan" className="px-3 py-2 text-center shadow-sm">20% Critical Reasoning</Tag>
                    <Tag color="green" className="px-3 py-2 text-center shadow-sm">25% Data Sufficiency</Tag>
                    <Tag color="gold" className="px-3 py-2 text-center shadow-sm">25% Problem Solving</Tag>
                  </div>
                </div>
              )}
            </Card>

            {/* Difficulty Settings */}
            <Card className="rounded-xl border-0 shadow-sm bg-gradient-to-br from-orange-50 to-white">
              <div className="flex items-center mb-6">
                <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center text-white mr-3">3</div>
                <Text strong className="text-lg text-orange-700">Difficulty Level</Text>
              </div>
              
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <Text className="text-base font-medium text-orange-700">Choose difficulty distribution</Text>
                  <Tooltip title="Select mixed for a balanced test, or specific to focus on one level">
                    <InfoIcon />
                  </Tooltip>
                </div>
                <Radio.Group
                  value={config.difficultyMode || 'mixed'}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    difficultyMode: e.target.value,
                    // Clear specific difficulty if switching to mixed mode
                    difficulty: e.target.value === 'mixed' ? undefined : prev.difficulty,
                    selectedDifficulties: e.target.value === 'mixed' ? undefined : prev.selectedDifficulties
                  }))}
                  buttonStyle="solid"
                  size="large"
                  className="w-full flex"
                >
                  <Radio.Button value="mixed" className="flex-1 text-center font-medium">
                    Mixed
                  </Radio.Button>
                  <Radio.Button value="specific" className="flex-1 text-center font-medium">
                    Specific Level
                  </Radio.Button>
                </Radio.Group>
              </div>
              
              {config.difficultyMode === 'specific' && (
                <div className="bg-white p-6 rounded-lg border border-orange-200 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-base font-medium text-orange-700">
                      Select Difficulty Level(s)
                    </label>
                    <Tooltip title="Choose one or more difficulty levels to practice">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div 
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        config.selectedDifficulties?.includes('easy') || config.difficulty === 'easy'
                          ? 'border-green-500 bg-green-50 shadow-md' 
                          : 'border-gray-200 hover:border-green-300 hover:bg-green-50 hover:shadow-sm'
                      }`}
                      onClick={() => {
                        // Handle multi-select logic
                        const currentSelected = config.selectedDifficulties || [];
                        let newSelected: string[];
                        
                        if (currentSelected.includes('easy')) {
                          // Remove if already selected
                          newSelected = currentSelected.filter((d: string) => d !== 'easy');
                        } else {
                          // Add if not selected
                          newSelected = [...currentSelected, 'easy'];
                        }
                        
                        setConfig(prev => ({ 
                          ...prev, 
                          difficulty: undefined, // Clear the single selection
                          selectedDifficulties: newSelected 
                        }));
                      }}
                    >
                      <div className="flex items-center">
                        {(config.selectedDifficulties?.includes('easy') || config.difficulty === 'easy') && <CheckIcon />}
                        <Title level={5} className="text-green-600 mb-2">Easy</Title>
                      </div>
                      <Text className="text-gray-600 block">Foundational concepts and straightforward applications</Text>
                    </div>
                    <div 
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        config.selectedDifficulties?.includes('medium') || config.difficulty === 'medium'
                          ? 'border-blue-500 bg-blue-50 shadow-md' 
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm'
                      }`}
                      onClick={() => {
                        // Handle multi-select logic
                        const currentSelected = config.selectedDifficulties || [];
                        let newSelected: string[];
                        
                        if (currentSelected.includes('medium')) {
                          // Remove if already selected
                          newSelected = currentSelected.filter((d: string) => d !== 'medium');
                        } else {
                          // Add if not selected
                          newSelected = [...currentSelected, 'medium'];
                        }
                        
                        setConfig(prev => ({ 
                          ...prev, 
                          difficulty: undefined, // Clear the single selection
                          selectedDifficulties: newSelected 
                        }));
                      }}
                    >
                      <div className="flex items-center">
                        {(config.selectedDifficulties?.includes('medium') || config.difficulty === 'medium') && <CheckIcon />}
                        <Title level={5} className="text-blue-600 mb-2">Medium</Title>
                      </div>
                      <Text className="text-gray-600 block">Moderate complexity with some advanced concepts</Text>
                    </div>
                    <div 
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        config.selectedDifficulties?.includes('hard') || config.difficulty === 'hard'
                          ? 'border-red-500 bg-red-50 shadow-md' 
                          : 'border-gray-200 hover:border-red-300 hover:bg-red-50 hover:shadow-sm'
                      }`}
                      onClick={() => {
                        // Handle multi-select logic
                        const currentSelected = config.selectedDifficulties || [];
                        let newSelected: string[];
                        
                        if (currentSelected.includes('hard')) {
                          // Remove if already selected
                          newSelected = currentSelected.filter((d: string) => d !== 'hard');
                        } else {
                          // Add if not selected
                          newSelected = [...currentSelected, 'hard'];
                        }
                        
                        setConfig(prev => ({ 
                          ...prev, 
                          difficulty: undefined, // Clear the single selection
                          selectedDifficulties: newSelected 
                        }));
                      }}
                    >
                      <div className="flex items-center">
                        {(config.selectedDifficulties?.includes('hard') || config.difficulty === 'hard') && <CheckIcon />}
                        <Title level={5} className="text-red-600 mb-2">Hard</Title>
                      </div>
                      <Text className="text-gray-600 block">Challenging problems that test deep understanding</Text>
                    </div>
                  </div>
                </div>
              )}
              
              {config.difficultyMode === 'mixed' && (
                <div className="bg-white p-5 rounded-lg border border-orange-200 shadow-md">
                  <div className="flex items-center mb-3">
                    <CheckIcon />
                    <Text strong className="text-orange-700">A balanced mix of difficulty levels will be included</Text>
                  </div>
                  <div className="flex justify-center gap-6 mt-2">
                    <Tag color="green" className="px-4 py-2 text-base shadow-sm">Easy</Tag>
                    <Tag color="blue" className="px-4 py-2 text-base shadow-sm">Medium</Tag>
                    <Tag color="red" className="px-4 py-2 text-base shadow-sm">Hard</Tag>
                  </div>
                </div>
              )}
            </Card>

            {/* Category Settings */}
            <Card className="rounded-xl border-0 shadow-sm bg-gradient-to-br from-purple-50 to-white">
              <div className="flex items-center mb-6">
                <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white mr-3">4</div>
                <Text strong className="text-lg text-purple-700">Category</Text>
              </div>
              
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <Text className="text-base font-medium text-purple-700">Choose category distribution</Text>
                  <Tooltip title="Select mixed for all categories, or focus on a specific one">
                    <InfoIcon />
                  </Tooltip>
                </div>
                <Radio.Group
                  value={config.categoryMode || 'mixed'}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    categoryMode: e.target.value,
                    // Clear specific category if switching to mixed mode
                    category: e.target.value === 'mixed' ? undefined : prev.category,
                    selectedCategories: e.target.value === 'mixed' ? undefined : prev.selectedCategories
                  }))}
                  buttonStyle="solid"
                  size="large"
                  className="w-full flex"
                >
                  <Radio.Button value="mixed" className="flex-1 text-center font-medium">
                    Mixed
                  </Radio.Button>
                  <Radio.Button value="specific" className="flex-1 text-center font-medium">
                    Specific Category
                  </Radio.Button>
                </Radio.Group>
              </div>
              
              {config.categoryMode === 'specific' && (
                <div className="bg-white p-6 rounded-lg border border-purple-200 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-base font-medium text-purple-700">
                      Select Category(s)
                    </label>
                    <Tooltip title="Choose one or more subject areas to focus on">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {categories.map(category => {
                      // Check if this category is in the selected categories array
                      const isSelected = config.selectedCategories?.includes(category) || config.category === category;
                      
                      let categoryColor = 'gray';
                      if (category === 'Quantitative Reasoning') categoryColor = 'blue';
                      if (category === 'Verbal Reasoning') categoryColor = 'green';
                      if (category === 'Data Insights') categoryColor = 'orange';
                      
                      return (
                        <div 
                          key={category}
                          className={`p-4 rounded-lg cursor-pointer transition-all flex items-center ${
                            isSelected 
                              ? `bg-${categoryColor}-100 border border-${categoryColor}-300 shadow-md` 
                              : 'bg-gray-50 border border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                          }`}
                          onClick={() => {
                            // Handle multi-select logic
                            const currentSelected = config.selectedCategories || [];
                            let newSelected: string[];
                            
                            if (currentSelected.includes(category)) {
                              // Remove if already selected
                              newSelected = currentSelected.filter((c: string) => c !== category);
                            } else {
                              // Add if not selected
                              newSelected = [...currentSelected, category];
                            }
                            
                            setConfig(prev => ({ 
                              ...prev, 
                              category: undefined, // Clear the single selection
                              selectedCategories: newSelected 
                            }));
                          }}
                        >
                          {isSelected && <CheckIcon />}
                          <span className={`${isSelected ? 'font-medium text-purple-800' : 'text-gray-700'}`}>{category}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {config.selectedCategories?.includes('Data Insights') && (
                    <div className="mt-4 bg-yellow-50 p-3 rounded border border-yellow-200">
                      <Text className="text-yellow-700 flex items-center">
                        <InfoCircleOutlined className="mr-2" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} /> 
                        Only Data Sufficiency questions are currently available for the Data Insights section. Other question types will be added soon.
                      </Text>
                    </div>
                  )}
                </div>
              )}

              {config.categoryMode === 'mixed' && (
                <div className="bg-white p-5 rounded-lg border border-purple-200 shadow-md">
                  <div className="flex items-center mb-3">
                    <CheckIcon />
                    <Text strong className="text-purple-700">Questions from all GMAT Focus Edition categories will be included</Text>
                  </div>
                  <div className="flex justify-center gap-3 mt-2">
                    {categories.map(category => (
                      <Tag key={category} color="purple" className="px-4 py-2 text-base shadow-sm">{category}</Tag>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div className="flex justify-center mt-10">
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                icon={<PlayIcon />}
                className="px-10 h-14 text-lg flex items-center shadow-lg hover:shadow-xl bg-blue-500 hover:bg-blue-600 border-blue-500 hover:border-blue-600 text-white rounded-lg transition-all duration-200"
              >
                Start Custom Quiz
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}; 