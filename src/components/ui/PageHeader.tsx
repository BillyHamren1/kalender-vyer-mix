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
    <div className={cn("mb-8", className)}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-7 rounded-2xl bg-card border border-border/40 shadow-2xl">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
              isWarehouse ? "shadow-warehouse/15" : "shadow-primary/15"
            )}
            style={{
              background: isWarehouse
                ? 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)'
                : 'var(--gradient-icon)'
            }}
          >
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--heading))]">
              {title}
            </h1>
            {subtitle && (
              <p className="text-muted-foreground mt-0.5 text-[0.925rem] leading-relaxed">
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
              className={cn(
                "font-semibold rounded-xl px-8 h-12",
                isWarehouse
                  ? "bg-warehouse hover:bg-warehouse-hover shadow-xl shadow-warehouse/25"
                  : "bg-primary hover:bg-[hsl(var(--primary-hover))] shadow-xl shadow-primary/25"
              )}
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
