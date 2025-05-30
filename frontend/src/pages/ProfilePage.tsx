import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, Typography, Row, Col, Statistic, Progress, Table, Tag } from 'antd';
import { UserOutlined, TrophyOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface PerformanceByType {
  [key: string]: {
    total: number;
    correct: number;
    percentage: number;
  };
}

interface RecentQuiz {
  id: string;
  score: number;
  totalQuestions: number;
  timeSpent: number;
  date: string;
}

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, stats, logout } = useAuth();
  const [recentQuizzes, setRecentQuizzes] = useState<RecentQuiz[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In the future, fetch recent quizzes here
    setRecentQuizzes([]);
    setLoading(false);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">Not logged in</h2>
          <p className="mt-2 text-gray-600">Please log in to view your profile</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const recentQuizzesColumns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Score',
      dataIndex: 'score',
      key: 'score',
      render: (score: number, record: any) => (
        <Text>
          {score}/{record.totalQuestions}
        </Text>
      ),
    },
    {
      title: 'Time Spent',
      dataIndex: 'timeSpent',
      key: 'timeSpent',
      render: (timeSpent: number) => `${Math.round(timeSpent / 60)} minutes`,
    },
  ];

  // Optional stats might not be available yet
  const questionTypeStats = stats?.questionTypeStats || [];

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">User Profile</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Personal details and quiz performance.</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              Logout
            </button>
          </div>
          <div className="border-t border-gray-200">
            <dl>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Full name</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{user.fullName}</dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Email address</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{user.email}</dd>
              </div>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Target GMAT Score</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{user.targetScore}</dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Quizzes Taken</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{stats?.totalQuizzes || 0}</dd>
              </div>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Average Score</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{stats?.averageScore || 0}%</dd>
              </div>
            </dl>
          </div>
        </div>

        {questionTypeStats.length > 0 && (
          <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Performance Breakdown</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Your performance by question type.</p>
            </div>
            <div className="border-t border-gray-200">
              <div className="px-4 py-5 sm:p-6">
                <div className="space-y-6">
                  {questionTypeStats.map((data) => (
                    <div key={data.type} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-lg font-medium text-gray-900">{data.type}</h4>
                        <span className="text-sm font-medium text-indigo-600">{data.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className="bg-indigo-600 h-2.5 rounded-full" 
                          style={{ width: `${data.percentage}%` }}
                        ></div>
                      </div>
                      <div className="mt-2 text-sm text-gray-500">
                        {data.correct} correct out of {data.total} questions
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {recentQuizzes.length > 0 && (
          <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Quizzes</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Your recent quiz results.</p>
            </div>
            <div className="border-t border-gray-200">
              <div className="px-4 py-5 sm:p-6">
                <Table
                  dataSource={recentQuizzes}
                  columns={recentQuizzesColumns}
                  pagination={{ pageSize: 5 }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage; 