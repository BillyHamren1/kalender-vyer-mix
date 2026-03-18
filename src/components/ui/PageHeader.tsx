import React from 'react';
import { LucideIcon } from 'lucide-react';
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
  /** Use warehouse amber accent instead of teal */
  variant?: 'default' | 'warehouse';
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
  className,
  variant = 'default'
}) => {
  const isWarehouse = variant === 'warehouse';

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-5 py-3.5 rounded-xl bg-card border border-border/40 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0",
              isWarehouse ? "shadow-warehouse/15" : "shadow-primary/15"
            )}
            style={{
              background: isWarehouse
                ? 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)'
                : 'var(--gradient-icon)'
            }}
          >
            <Icon className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--heading))] leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground mt-0.5 text-xs leading-none">
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
              size="sm"
              className={cn(
                "font-medium rounded-lg px-4 h-8",
                isWarehouse
                  ? "bg-warehouse hover:bg-warehouse-hover shadow-sm shadow-warehouse/20"
                  : "bg-primary hover:bg-[hsl(var(--primary-hover))] shadow-sm shadow-primary/20"
              )}
            >
              {action.icon && <action.icon className="h-4 w-4 mr-1.5" />}
              {action.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
