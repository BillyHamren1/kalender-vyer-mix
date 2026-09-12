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
  /** Internal variant name is retained for compatibility; purple means Operations. */
  variant?: 'default' | 'warehouse' | 'purple';
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
  className,
  variant = 'default',
}) => {
  const isWarehouse = variant === 'warehouse';
  const isOperations = variant === 'purple';

  if (isOperations) {
    return (
      <header
        className={cn(
          'relative mb-4 min-h-[98px] lg:h-[98px] lg:min-h-[98px] overflow-hidden rounded-[18px] border px-[22px] py-[19px]',
          'flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between',
          className,
        )}
        style={{
          borderColor: 'hsl(var(--module-accent-base) / 0.20)',
          background:
            'radial-gradient(circle at 91% 0%, hsl(var(--module-accent-base) / 0.11), transparent 37%), linear-gradient(105deg, hsl(var(--card)) 0%, hsl(var(--card)) 66%, hsl(var(--module-accent-soft) / 0.46) 100%)',
          boxShadow:
            '0 16px 38px hsl(200 45% 15% / 0.09), inset 0 1px 0 hsl(0 0% 100% / 0.95)',
        }}
      >
        <div
          className="absolute bottom-[17px] left-0 top-[17px] w-1 rounded-r-full"
          style={{
            background: 'linear-gradient(180deg, hsl(var(--module-accent-base)), hsl(var(--module-accent)))',
            boxShadow: '0 0 16px hsl(var(--module-accent-base) / 0.34)',
          }}
        />

        <div className="flex min-w-0 items-center gap-4">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] text-white"
            style={{
              background:
                'radial-gradient(circle at 28% 18%, hsl(0 0% 100% / 0.20), transparent 35%), linear-gradient(145deg, hsl(var(--module-accent-base)), hsl(var(--module-accent)))',
              boxShadow:
                '0 13px 27px hsl(var(--module-accent) / 0.31), inset 0 1px 0 hsl(0 0% 100% / 0.22)',
            }}
          >
            <Icon className="relative z-10 h-[30px] w-[30px]" strokeWidth={2} />
            <span className="absolute -bottom-4 -right-2 h-[30px] w-[43px] -rotate-[13deg] rounded-full bg-white/[0.09]" />
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-bold leading-tight tracking-[-0.035em] text-[#172F3A]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 truncate text-sm leading-none text-[#7B8D92]">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 sm:flex-row sm:items-center">
          {children}
          {action && (
            <Button onClick={action.onClick} size="sm" className="h-10 rounded-xl px-4 font-semibold">
              {action.icon && <action.icon className="mr-1.5 h-4 w-4" />}
              {action.label}
            </Button>
          )}
        </div>
      </header>
    );
  }

  const getIconBackground = () => {
    if (isWarehouse) return 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)';
    return 'var(--gradient-icon)';
  };

  return (
    <div className={cn('mb-4', className)}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-5 py-3.5 rounded-xl bg-card border border-border/40 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0"
            style={{ background: getIconBackground() }}
          >
            <Icon className="text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[hsl(var(--heading))] leading-none">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-0.5 text-xs leading-none">{subtitle}</p>}
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
                isWarehouse && 'bg-warehouse hover:bg-warehouse-hover shadow-sm shadow-warehouse/20',
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
