import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PremiumCardProps {
  icon?: LucideIcon;
  title?: string;
  subtitle?: string;
  count?: number;
  accentColor?: 'primary' | 'amber' | 'emerald' | 'blue';
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

const accentColors = {
  primary: 'from-primary/40 via-primary/80 to-primary/40',
  amber: 'from-amber-400/60 via-amber-500 to-amber-400/60',
  emerald: 'from-emerald-400/60 via-emerald-500 to-emerald-400/60',
  blue: 'from-blue-400/60 via-blue-500 to-blue-400/60',
};

const iconBgColors = {
  primary: 'from-primary/15 to-primary/5 ring-primary/20',
  amber: 'from-amber-500/15 to-amber-500/5 ring-amber-500/20',
  emerald: 'from-emerald-500/15 to-emerald-500/5 ring-emerald-500/20',
  blue: 'from-blue-500/15 to-blue-500/5 ring-blue-500/20',
};

const iconColors = {
  primary: 'text-primary',
  amber: 'text-amber-600',
  emerald: 'text-emerald-600',
  blue: 'text-blue-600',
};

export const PremiumCard: React.FC<PremiumCardProps> = ({
  icon: Icon,
  title,
  subtitle,
  count,
  accentColor = 'primary',
  headerAction,
  children,
  className,
  noPadding = false,
}) => {
  return (
    <div className={cn("relative", className)}>
      <div 
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)',
          boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px hsl(var(--border) / 0.5)',
        }}
      >
        {/* Gradient accent bar */}
        <div className={cn("h-1.5 bg-gradient-to-r", accentColors[accentColor])} />
        
        {/* Header - only if title is provided */}
        {title && (
          <div className="p-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {Icon && (
                  <div className={cn("p-2.5 rounded-xl bg-gradient-to-br ring-1", iconBgColors[accentColor])}>
                    <Icon className={cn("h-5 w-5", iconColors[accentColor])} />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg text-foreground">{title}</h3>
                  {subtitle && (
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {count !== undefined && (
                  <Badge 
                    variant="secondary" 
                    className="h-7 px-3 text-sm font-medium bg-muted/80 hover:bg-muted"
                  >
                    {count}
                  </Badge>
                )}
                {headerAction}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className={cn(noPadding ? "" : "px-5 pb-5", !title && "pt-5")}>
          {children}
        </div>
      </div>
    </div>
  );
};

// Simple variant without the accent bar for nested cards
export const SimpleCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}> = ({ children, className, onClick, hoverable = false }) => {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-4 rounded-xl border border-border bg-card shadow-sm transition-all duration-200",
        hoverable && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        className
      )}
    >
      {children}
    </div>
  );
};
