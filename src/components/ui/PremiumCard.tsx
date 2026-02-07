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

const iconGradients = {
  primary: 'var(--gradient-icon)',
  amber: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)',
  emerald: 'linear-gradient(135deg, hsl(152 60% 45%) 0%, hsl(152 65% 35%) 100%)',
  blue: 'linear-gradient(135deg, hsl(217 70% 50%) 0%, hsl(217 75% 40%) 100%)',
};

const iconShadows = {
  primary: 'shadow-primary/15',
  amber: 'shadow-amber-500/15',
  emerald: 'shadow-emerald-500/15',
  blue: 'shadow-blue-500/15',
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
      <div className="rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden">
        {/* Header - only if title is provided */}
        {title && (
          <div className="p-7 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {Icon && (
                  <div
                    className={cn("w-11 h-11 rounded-xl flex items-center justify-center shadow-lg", iconShadows[accentColor])}
                    style={{ background: iconGradients[accentColor] }}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg text-[hsl(var(--heading))]">{title}</h3>
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
        <div className={cn(noPadding ? "" : "px-7 pb-7", !title && "pt-7")}>
          {children}
        </div>
      </div>
    </div>
  );
};

// Simple variant without icon header for nested cards
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
        "p-5 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm transition-all duration-200",
        hoverable && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        className
      )}
    >
      {children}
    </div>
  );
};
