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

  const getIconBackground = () => {
    if (isWarehouse) return 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)';
    if (isPurple) return 'linear-gradient(135deg, hsl(270 45% 60%) 0%, hsl(280 50% 45%) 100%)';
    return 'var(--gradient-icon)';
  };

  const getShadowClass = () => {
    if (isWarehouse) return 'shadow-warehouse/15';
    if (isPurple) return 'shadow-[hsl(270_45%_55%)]/15';
    return 'shadow-primary/15';
  };

  const wrapperClass = isPurple
    ? 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-5 py-3.5 rounded-xl border border-[hsl(270_30%_86%)]/60 shadow-sm planning-hero'
    : 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-5 py-3.5 rounded-xl bg-card border border-border/40 shadow-sm';

  return (
    <div className={cn("mb-4", className)}>
      <div className={wrapperClass}>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0",
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
                "font-medium rounded-lg px-4 h-8",
                isWarehouse
                  ? "bg-warehouse hover:bg-warehouse-hover shadow-sm shadow-warehouse/20"
                  : isPurple
                    ? "planning-btn-primary px-4 h-8"
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
