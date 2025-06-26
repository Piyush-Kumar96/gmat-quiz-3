import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analytics } from '../services/analytics';

type SubscriptionPlan = 'free_mock' | 'monthly_pack' | 'quarterly_pack' | 'annual_pack';

interface PlanOption {
  id: SubscriptionPlan;
  name: string;
  price: string;
  duration: string;
  features: string[];
  recommended?: boolean;
}

const planOptions: PlanOption[] = [
  {
    id: 'free_mock',
    name: 'Just Exploring',
    price: 'Free',
    duration: '',
    features: [
      '2 Mock Tests',
      'Basic Question Review',
      'Score Tracking',
      'Limited Features'
    ]
  },
  {
    id: 'monthly_pack',
    name: 'Monthly Pack',
    price: '$15',
    duration: '/month',
    features: [
      'Unlimited Mock Tests',
      'Detailed Analytics',
      'Question History',
      'Performance Insights',
      '1 Question Reset'
    ]
  },
  {
    id: 'quarterly_pack',
    name: 'Quarterly Pack',
    price: '$45',
    duration: '/3 months',
    recommended: true,
    features: [
      'Unlimited Mock Tests',
      'Advanced Analytics',
      'Question History',
      'Performance Insights',
      '1 Question Reset',
      'Priority Support'
    ]
  },
  {
    id: 'annual_pack',
    name: 'Annual Pack',
    price: '$140',
    duration: '/year',
    features: [
      'Unlimited Mock Tests',
      'Premium Analytics',
      'Question History',
      'Performance Insights',
      'Unlimited Question Resets',
      'Priority Support',
      'Study Plan Recommendations'
    ]
  }
];

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, error, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [targetScore, setTargetScore] = useState('700');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('free_mock');
  const [isLoading, setIsLoading] = useState(false);

  // Track page view
  useEffect(() => {
    analytics.trackPageView({
      page_name: 'Register Page'
    });
  }, []);

  // Track successful registration when user state changes
  useEffect(() => {
    if (user && !isLoading) {
      analytics.trackUserSignedUp({
        userId: user._id,
        email: user.email,
        registrationMethod: 'email'
      });
    }
  }, [user, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await register({
        email,
        password,
        fullName,
        targetScore: parseInt(targetScore, 10),
        subscriptionPlan: selectedPlan
      });
      navigate('/');
    } catch (err) {
      // Error is handled by the auth context
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Or{' '}
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              sign in to your existing account
            </Link>
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <div className="bg-white shadow-xl rounded-lg overflow-hidden">
          <div className="px-6 py-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="full-name" className="block text-sm font-medium text-gray-700">
                      Full Name
                    </label>
                    <input
                      id="full-name"
                      name="fullName"
                      type="text"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="email-address" className="block text-sm font-medium text-gray-700">
                      Email Address
                    </label>
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="target-score" className="block text-sm font-medium text-gray-700">
                      Target GMAT Score
                    </label>
                    <input
                      id="target-score"
                      name="targetScore"
                      type="number"
                      min="200"
                      max="800"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="e.g., 700"
                      value={targetScore}
                      onChange={(e) => setTargetScore(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Plan Selection */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Choose Your Plan</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {planOptions.map((plan) => (
                    <div
                      key={plan.id}
                      className={`relative rounded-lg border cursor-pointer transition-all duration-200 ${
                        selectedPlan === plan.id
                          ? 'border-indigo-500 ring-2 ring-indigo-500 bg-indigo-50'
                          : 'border-gray-300 hover:border-gray-400'
                      } ${plan.recommended ? 'ring-2 ring-green-500 border-green-500' : ''}`}
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      {plan.recommended && (
                        <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                          <span className="bg-green-500 text-white px-3 py-1 text-xs font-medium rounded-full">
                            Recommended
                          </span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center">
                          <input
                            type="radio"
                            name="plan"
                            value={plan.id}
                            checked={selectedPlan === plan.id}
                            onChange={() => setSelectedPlan(plan.id)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                          <div className="ml-3 flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {plan.name}
                            </div>
                            <div className="text-lg font-bold text-gray-900">
                              {plan.price}
                              <span className="text-sm font-normal text-gray-500">
                                {plan.duration}
                              </span>
                            </div>
                          </div>
                        </div>
                        <ul className="mt-3 space-y-1">
                          {plan.features.map((feature, index) => (
                            <li key={index} className="flex items-center text-xs text-gray-600">
                              <svg className="h-3 w-3 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating account...
                    </div>
                  ) : (
                    'Create account'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Additional Information */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            By creating an account, you agree to our{' '}
            <button 
              type="button" 
              className="text-indigo-600 hover:text-indigo-500 underline bg-transparent border-none cursor-pointer p-0 font-inherit"
              onClick={() => console.log('Terms of Service clicked')}
            >
              Terms of Service
            </button>
            {' '}and{' '}
            <button 
              type="button" 
              className="text-indigo-600 hover:text-indigo-500 underline bg-transparent border-none cursor-pointer p-0 font-inherit"
              onClick={() => console.log('Privacy Policy clicked')}
            >
              Privacy Policy
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}; 