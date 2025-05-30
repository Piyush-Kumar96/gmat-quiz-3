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
  Col 
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
  BookOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

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
        <Collapse 
          className="mb-6 rounded-lg overflow-hidden shadow-md" 
          activeKey={expandedSections}
          onChange={(keys) => setExpandedSections(keys as string[])}
          expandIconPosition="end"
        >
          <Panel 
            header={
              <div className="flex items-center py-2">
                <ExamIcon />
                <span className="text-lg font-semibold">Practice Exams</span>
              </div>
            } 
            key="1"
            className="bg-white"
          >
            <div className="p-2">
              <Alert
                message="GMAT Focus Edition Practice Tests"
                description="Prepare for the GMAT Focus Edition with our practice exams. Currently, only Data Sufficiency questions are fully available for the Data Insights section. Additional question types such as Multi-Source Reasoning, Table Analysis, Graphics Interpretation, and Two-Part Analysis will be added soon."
                type="info"
                showIcon
                className="mb-6"
              />
              
              <Row gutter={[16, 16]} className="mb-6">
                <Col xs={24} md={12}>
                  <Card 
                    className="h-full border-t-4 border-indigo-500 hover:shadow-lg transition-shadow"
                    title={
                      <div className="flex items-center">
                        <MockTestIcon />
                        <span className="text-indigo-700">Take Mock Test</span>
                      </div>
                    }
                  >
                    <div className="mb-4">
                      <Text className="text-gray-600 block mb-3">
                        Complete GMAT Focus Edition simulation with all sections:
                      </Text>
                      <ul className="list-disc list-inside ml-2 mb-4 text-gray-600">
                        <li>Quantitative Reasoning</li>
                        <li>Verbal Reasoning</li>
                        <li>Data Insights</li>
                      </ul>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Tag color="blue">35 Questions</Tag>
                        <Tag color="green">65 Minutes</Tag>
                        <Tag color="orange">Adaptive Difficulty</Tag>
                      </div>
                    </div>
                    <Button 
                      type="primary" 
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                      size="large"
                      icon={<RightArrowIcon />}
                      onClick={handleMockTest}
                    >
                      Start Mock Test
                    </Button>
                  </Card>
                </Col>
                
                <Col xs={24} md={12}>
                  <Card 
                    className="h-full border-t-4 border-purple-500 hover:shadow-lg transition-shadow"
                    title={
                      <div className="flex items-center">
                        <SectionalTestIcon />
                        <span className="text-purple-700">Take Sectional Tests</span>
                      </div>
                    }
                  >
                    <div className="mb-4">
                      <Text className="text-gray-600 block mb-3">
                        Focus on specific exam sections to master each area:
                      </Text>
                      
                      <div className="space-y-4">
                        <div className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition-colors">
                          <div className="flex justify-between items-center mb-2">
                            <Text strong className="text-blue-700">Quantitative Reasoning</Text>
                            <div className="flex gap-2">
                              <Tag color="cyan">20 Questions</Tag>
                              <Tag color="green">35 Minutes</Tag>
                            </div>
                          </div>
                          <Button 
                            className="w-full"
                            onClick={() => handleSectionalTest('quant')}
                          >
                            Start Quant Section
                          </Button>
                        </div>
                        
                        <div className="p-3 border border-gray-200 rounded-lg hover:border-green-300 cursor-pointer transition-colors">
                          <div className="flex justify-between items-center mb-2">
                            <Text strong className="text-green-700">Verbal Reasoning</Text>
                            <div className="flex gap-2">
                              <Tag color="cyan">18 Questions</Tag>
                              <Tag color="green">30 Minutes</Tag>
                            </div>
                          </div>
                          <Button 
                            className="w-full"
                            onClick={() => handleSectionalTest('verbal')}
                          >
                            Start Verbal Section
                          </Button>
                        </div>
                        
                        <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                          <div className="flex justify-between items-center mb-2">
                            <Text strong className="text-gray-500">Data Insights</Text>
                            <div className="flex gap-2">
                              <Tag color="cyan">10 Questions</Tag>
                              <Tag color="green">20 Minutes</Tag>
                            </div>
                          </div>
                          <Tooltip title="Coming soon - Currently in development">
                            <Button 
                              className="w-full" 
                              disabled
                            >
                              Coming Soon
                            </Button>
                          </Tooltip>
                          <Text className="text-xs text-yellow-600 mt-2 block">
                            Note: Data Insights section is under development. Currently only Data Sufficiency questions are available.
                          </Text>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>
            </div>
          </Panel>
        </Collapse>
        
        {/* Customize Quiz Section */}
        <Collapse 
          className="mb-6 rounded-lg overflow-hidden shadow-md" 
          activeKey={expandedSections}
          onChange={(keys) => setExpandedSections(keys as string[])}
          expandIconPosition="end"
        >
          <Panel 
            header={
              <div className="flex items-center py-2">
                <SettingIcon />
                <span className="text-lg font-semibold">Customize Your Quiz</span>
              </div>
            } 
            key="2"
            className="bg-white"
          >
            <div className="p-2">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Quiz Settings */}
                <div className="mb-6">
                  <div className="flex items-center mb-4">
                    <SettingIcon />
                    <Text strong className="text-lg">Basic Settings</Text>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 flex items-center">
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

                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 flex items-center">
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
                </div>
                
                {/* Question Type Settings */}
                <div className="mb-6">
                  <div className="flex items-center mb-4">
                    <TagIcon />
                    <Text strong className="text-lg">Question Types</Text>
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <Text className="text-sm font-medium text-gray-700">Choose how to select question types</Text>
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
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-inner">
                      <div className="flex items-center justify-between mb-4">
                        <label className="block text-sm font-semibold text-gray-700">
                          Select Question Type(s)
                        </label>
                        <Tooltip title="Choose one or more question types to focus on">
                          <InfoIcon />
                        </Tooltip>
                      </div>
                      
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-3">
                          {questionTypes.map(type => {
                            // Check if this type is in the selected types array
                            const isSelected = config.selectedQuestionTypes?.includes(type) || config.questionType === type;
                            
                            return (
                              <Tag 
                                key={type}
                                color={isSelected ? 'blue' : 'default'}
                                className={`px-4 py-2 cursor-pointer text-base transition-all ${
                                  isSelected 
                                    ? 'shadow-md font-medium' 
                                    : 'hover:shadow-sm'
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
                                {type}
                              </Tag>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {config.questionTypeMode === 'balanced' && (
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-200 shadow-inner">
                      <div className="flex items-center justify-between mb-3">
                        <Text strong>A balanced mix of question types will be included:</Text>
                        <Tooltip title="This distribution matches the official GMAT Focus Edition exam">
                          <InfoIcon />
                        </Tooltip>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2">
                        <Tag color="blue" className="px-3 py-1 text-sm shadow-sm">30% Reading Comprehension</Tag>
                        <Tag color="cyan" className="px-3 py-1 text-sm shadow-sm">20% Critical Reasoning</Tag>
                        <Tag color="green" className="px-3 py-1 text-sm shadow-sm">25% Data Sufficiency</Tag>
                        <Tag color="gold" className="px-3 py-1 text-sm shadow-sm">25% Problem Solving</Tag>
                      </div>
                    </div>
                  )}
                </div>

                {/* Difficulty Settings */}
                <div className="mb-6">
                  <div className="flex items-center mb-4">
                    <ChartIcon />
                    <Text strong className="text-lg">Difficulty Level</Text>
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <Text className="text-sm font-medium text-gray-700">Choose difficulty distribution</Text>
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
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-inner">
                      <div className="flex items-center justify-between mb-4">
                        <label className="block text-sm font-semibold text-gray-700">
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
                          <Title level={5} className="text-green-600 mb-2">Easy</Title>
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
                          <Title level={5} className="text-blue-600 mb-2">Medium</Title>
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
                          <Title level={5} className="text-red-600 mb-2">Hard</Title>
                          <Text className="text-gray-600 block">Challenging problems that test deep understanding</Text>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {config.difficultyMode === 'mixed' && (
                    <div className="bg-orange-50 p-5 rounded-lg border border-orange-200 shadow-inner">
                      <div className="flex items-center justify-between mb-2">
                        <Text strong>A balanced mix of difficulty levels will be included</Text>
                        <Tooltip title="This matches the distribution on the real GMAT exam">
                          <InfoIcon />
                        </Tooltip>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1">
                        <Tag color="green" className="px-3 py-1 text-sm shadow-sm">Easy</Tag>
                        <Tag color="blue" className="px-3 py-1 text-sm shadow-sm">Medium</Tag>
                        <Tag color="red" className="px-3 py-1 text-sm shadow-sm">Hard</Tag>
                      </div>
                    </div>
                  )}
                </div>

                {/* Category Settings */}
                <div className="mb-8">
                  <div className="flex items-center mb-4">
                    <CategoryIcon />
                    <Text strong className="text-lg">Category</Text>
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <Text className="text-sm font-medium text-gray-700">Choose category distribution</Text>
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
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-inner">
                      <div className="flex items-center justify-between mb-4">
                        <label className="block text-sm font-semibold text-gray-700">
                          Select Category(s)
                        </label>
                        <Tooltip title="Choose one or more subject areas to focus on">
                          <InfoIcon />
                        </Tooltip>
                      </div>
                      
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-3">
                          {categories.map(category => {
                            // Check if this category is in the selected categories array
                            const isSelected = config.selectedCategories?.includes(category) || config.category === category;
                            
                            return (
                              <Tag 
                                key={category}
                                color={isSelected ? 'purple' : 'default'}
                                className={`px-4 py-2 cursor-pointer text-base transition-all ${
                                  isSelected 
                                    ? 'shadow-md font-medium' 
                                    : 'hover:shadow-sm'
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
                                {category}
                              </Tag>
                            );
                          })}
                        </div>
                      </div>
                      
                      {config.selectedCategories?.includes('Data Insights') && (
                        <div className="mt-4 bg-yellow-50 p-3 rounded border border-yellow-200">
                          <Text className="text-yellow-700">
                            <InfoCircleOutlined className="mr-2" onPointerEnterCapture={() => {}} onPointerLeaveCapture={() => {}} /> Only Data Sufficiency questions are currently available for the Data Insights section. Other question types will be added soon.
                          </Text>
                        </div>
                      )}
                    </div>
                  )}

                  {config.categoryMode === 'mixed' && (
                    <div className="bg-purple-50 p-5 rounded-lg border border-purple-200 shadow-inner">
                      <div className="flex items-center justify-between mb-2">
                        <Text strong>Questions from all GMAT Focus Edition categories will be included</Text>
                        <Tooltip title="This gives you practice across all GMAT Focus Edition content areas">
                          <InfoIcon />
                        </Tooltip>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {categories.map(category => (
                          <Tag key={category} color="purple" className="px-3 py-1 text-sm shadow-sm">{category}</Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-center mt-8">
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    loading={loading}
                    icon={<PlayIcon />}
                    className="px-10 h-12 text-lg flex items-center shadow-lg hover:shadow-xl bg-blue-500 hover:bg-blue-600 border-blue-500 hover:border-blue-600 text-white rounded-lg transition-all duration-200"
                >
                  Start Custom Quiz
                  </Button>
                </div>
              </form>
            </div>
          </Panel>
        </Collapse>
      </div>
    </div>
  );
}; 