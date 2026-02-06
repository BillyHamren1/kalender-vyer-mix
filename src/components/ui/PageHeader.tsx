import React from 'react';
import { LucideIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
  children?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
  className
}) => {
  return (
    <div className={cn("relative mb-8", className)}>
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary/3 rounded-full blur-2xl" />
      </div>
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-card/80 via-card to-card/80 backdrop-blur-sm border border-border/50 shadow-lg">
        <div className="flex items-center gap-4">
          <div 
            className="relative p-3.5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg"
            style={{ boxShadow: '0 8px 32px hsl(var(--primary) / 0.3)' }}
          >
            <Icon className="h-7 w-7 text-primary-foreground" />
            <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-primary-foreground/80" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {children}
          {action && (
            <Button 
              onClick={action.onClick}
              size="lg"
              className="shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 rounded-xl px-6"
              style={{ boxShadow: '0 4px 20px hsl(var(--primary) / 0.25)' }}
            >
              {action.icon && <action.icon className="h-5 w-5 mr-2" />}
              {action.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
