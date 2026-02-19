import React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const PageContainer: React.FC<PageContainerProps> = ({ children, className }) => {
  return (
    <div className="min-h-screen relative" style={{ background: 'var(--gradient-page)' }}>
      {/* Subtle radial overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.06),transparent)]" />
      <div className={cn("relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px] overflow-hidden", className)}>
        {children}
      </div>
    </div>
  );
};
