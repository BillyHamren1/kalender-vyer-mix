import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Users, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';

const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    {
      name: 'Kalender',
      href: '/calendar',
      icon: Calendar,
    },
    {
      name: 'Bokningar',
      href: '/booking-list',
      icon: FolderKanban,
    },
    {
      name: 'Personal',
      href: '/staff-management',
      icon: Users,
    },
  ];

  return (
    <nav className="bg-background border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 gap-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <Calendar className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">EventFlow</span>
          </Link>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
