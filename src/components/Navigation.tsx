
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Users, User, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    {
      name: 'Resource View',
      href: '/resource-view',
      icon: Calendar,
    },
    {
      name: 'Staff Calendar',
      href: '/staff-calendar',
      icon: BarChart3,
    },
    {
      name: 'Staff Management',
      href: '/staff-management',
      icon: Users,
    },
  ];

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex space-x-8">
              {navItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium',
                      isActive
                        ? 'border-[#82b6c6] text-[#82b6c6]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    )}
                  >
                    <item.icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
