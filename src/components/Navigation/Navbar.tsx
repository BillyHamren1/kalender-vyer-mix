import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Users, MapPin, CheckCircle2, Clock } from 'lucide-react';

const Navbar: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Staff Planner
            </Link>
            
            <div className="hidden md:flex items-center space-x-4">
              <Link
                to="/calendar"
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/calendar') || isActive('/custom-calendar')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Calendar className="h-4 w-4" />
                Calendar
              </Link>
              
              <Link
                to="/staff-management"
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/staff-management')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Users className="h-4 w-4" />
                Staff
              </Link>

              <Link
                to="/finished-jobs"
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/finished-jobs')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                Finished Jobs
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
