import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analytics } from '../services/analytics';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Function to check if a path is active
  const isActive = (path: string): boolean => {
    if (path === '/') {
      return location.pathname === '/';
    }
    
    // Special case for Quiz section - highlight for both /quiz and /config paths
    if (path === '/quiz') {
      return location.pathname.startsWith('/quiz') || location.pathname.startsWith('/config');
    }
    
    return location.pathname.startsWith(path);
  };
  
  // Get the CSS classes for a nav link based on active state
  const getLinkClasses = (path: string): string => {
    const baseClasses = "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200";
    
    // Special case for Import page - use green color scheme
    if (path === '/import' && isActive(path)) {
      return `${baseClasses} border-green-500 text-green-700 font-semibold`;
    }
    
    // Special case for Quiz page - use blue color scheme from homepage
    if (path === '/quiz' && isActive(path)) {
      return `${baseClasses} border-blue-500 text-blue-700 font-semibold`;
    }
    
    const activeClasses = "border-indigo-500 text-indigo-600 font-semibold";
    const inactiveClasses = "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700";
    
    return `${baseClasses} ${isActive(path) ? activeClasses : inactiveClasses}`;
  };
  
  // Get the CSS classes for a mobile nav link based on active state
  const getMobileLinkClasses = (path: string): string => {
    const baseClasses = "block pl-3 pr-4 py-2 border-l-4 text-base font-medium";
    
    // Special case for Import page - use green color scheme
    if (path === '/import' && isActive(path)) {
      return `${baseClasses} bg-green-50 border-green-500 text-green-700`;
    }
    
    // Special case for Quiz page - use blue color scheme from homepage
    if (path === '/quiz' && isActive(path)) {
      return `${baseClasses} bg-blue-50 border-blue-500 text-blue-700`;
    }
    
    const activeClasses = "bg-indigo-50 border-indigo-500 text-indigo-700";
    const inactiveClasses = "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700";
    
    return `${baseClasses} ${isActive(path) ? activeClasses : inactiveClasses}`;
  };

  const handleLogout = () => { analytics.trackUserLoggedOut();
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white shadow fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-xl font-bold text-indigo-600">
                GMAT Quiz
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                to="/"
                className={getLinkClasses('/')}
              >
                Home
              </Link>
              <Link
                to="/quiz"
                className={getLinkClasses('/quiz')}
              >
                Quiz
              </Link>
              <Link
                to="/review"
                className={getLinkClasses('/review')}
              >
                Question Bank
              </Link>
              <Link
                to="/import"
                className={getLinkClasses('/import')}
              >
                Import
              </Link>
            </div>
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {user ? (
              <div className="flex items-center space-x-4">
                <Link
                  to="/profile"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('/profile') ? 'bg-gray-100 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  to="/login"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('/login') ? 'bg-gray-100 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('/register') ? 'bg-indigo-700 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                  Register
                </Link>
              </div>
            )}
          </div>
          <div className="-mr-2 flex items-center sm:hidden">
            {/* Mobile menu button */}
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
              aria-controls="mobile-menu"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              <svg
                className="block h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu, show/hide based on menu state */}
      <div className="sm:hidden" id="mobile-menu">
        <div className="pt-2 pb-3 space-y-1">
          <Link
            to="/"
            className={getMobileLinkClasses('/')}
          >
            Home
          </Link>
          <Link
            to="/quiz"
            className={getMobileLinkClasses('/quiz')}
          >
            Quiz
          </Link>
          <Link
            to="/review"
            className={getMobileLinkClasses('/review')}
          >
            Question Bank
          </Link>
          <Link
            to="/import"
            className={getMobileLinkClasses('/import')}
          >
            Import
          </Link>
        </div>
        <div className="pt-4 pb-3 border-t border-gray-200">
          {user ? (
            <div className="space-y-1">
              <Link
                to="/profile"
                className={`block px-4 py-2 text-base font-medium ${isActive('/profile') ? 'bg-gray-100 text-indigo-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
              >
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-base font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <Link
                to="/login"
                className={`block px-4 py-2 text-base font-medium ${isActive('/login') ? 'bg-gray-100 text-indigo-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
              >
                Login
              </Link>
              <Link
                to="/register"
                className={`block px-4 py-2 text-base font-medium ${isActive('/register') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}; 