import React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  theme?: 'default' | 'purple';
}

export const PageContainer: React.FC<PageContainerProps> = ({ children, className, theme }) => {
  const isPurple = theme === 'purple';
  return (
    <div
      className={cn('min-h-screen relative', isPurple && 'theme-purple')}
      style={{ background: 'var(--gradient-page)' }}
    >
      {/* Mjuk radial-overlay — lila för Planning, teal för Booking */}
      <div
        className={cn(
          'absolute inset-0 pointer-events-none',
          isPurple
            ? 'planning-radial-overlay'
            : 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.06),transparent)]',
        )}
      />
      <div
        className={cn(
          'relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px] overflow-hidden',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
};
