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
  /** Visual variant: default (Booking teal), warehouse (amber), purple (Planning lila) */
  variant?: 'default' | 'warehouse' | 'purple';
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
  const isPurple = variant === 'purple';

  // Purple banner-style header (matches Booking teal banner UI, but in lila)
  if (isPurple) {
    return (
      <div className={cn('mb-4', className)}>
        <div
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-6 py-5 rounded-2xl text-white shadow-[0_10px_28px_-14px_hsl(263_70%_40%/0.55)]"
          style={{ background: 'var(--gradient-planner)' }}
        >
          {/* Left: icon tile + title block */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-sm shrink-0">
              <Icon
                className="text-[hsl(var(--planner-deep))]"
                style={{ width: 26, height: 26 }}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white leading-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-white/85 text-sm mt-0.5 leading-tight truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right: extra children + primary action */}
          <div className="flex items-center gap-2 shrink-0 [&_button]:rounded-xl">
            {children && (
              <div className="flex items-center gap-2 [&_button]:bg-white/15 [&_button]:text-white [&_button]:border-white/25 [&_button:hover]:bg-white/25 [&_button]:shadow-none">
                {children}
              </div>
            )}
            {action && (
              <Button
                onClick={action.onClick}
                size="sm"
                className="font-semibold rounded-xl px-4 h-10 bg-white text-[hsl(var(--planner-deep))] hover:bg-white/90 shadow-sm"
              >
                {action.icon && <action.icon className="h-4 w-4 mr-1.5" />}
                {action.label}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default & warehouse: untouched card style
  const getIconBackground = () => {
    if (isWarehouse) return 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)';
    return 'var(--gradient-icon)';
  };

  const getShadowClass = () => {
    if (isWarehouse) return 'shadow-warehouse/15';
    return 'shadow-primary/15';
  };

  return (
    <div className={cn('mb-4', className)}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-5 py-3.5 rounded-xl bg-card border border-border/40 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0',
              getShadowClass()
            )}
            style={{ background: getIconBackground() }}
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
                'font-medium rounded-lg px-4 h-8',
                isWarehouse
                  ? 'bg-warehouse hover:bg-warehouse-hover shadow-sm shadow-warehouse/20'
                  : 'bg-primary hover:bg-[hsl(var(--primary-hover))] shadow-sm shadow-primary/20'
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
