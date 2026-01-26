import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, FolderKanban, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const Index = () => {
  const location = useLocation();

  const tabs = [
    {
      title: 'Personalplanering',
      icon: Calendar,
      path: '/calendar',
    },
    {
      title: 'Projekthantering',
      icon: FolderKanban,
      path: '/projects',
    },
    {
      title: 'Personaladministration',
      icon: Users,
      path: '/staff-management',
    }
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-background">
      {/* Full-width tabs at top */}
      <div className="w-full border-b border-border bg-card">
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.path);
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-all duration-200 border-b-2",
                  active
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.title}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex items-center justify-center p-8" style={{ minHeight: 'calc(100vh - 57px)' }}>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Välkommen till EventFlow</h1>
          <p className="text-muted-foreground">Välj en flik ovan för att börja</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
