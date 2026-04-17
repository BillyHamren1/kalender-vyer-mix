import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import MobileBottomNav from '@/components/mobile-app/MobileBottomNav';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useBackgroundLocationReporter } from '@/hooks/useBackgroundLocationReporter';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';

interface TimeAppLayoutProps {
  children: React.ReactNode;
}

/**
 * TimeAppLayout — the native shell for EventFlow Time.
 * Owns the single scroll container for the time app to avoid
 * iOS viewport/body scroll jitter with fixed bottom navigation.
 */
const TimeAppLayout: React.FC<TimeAppLayoutProps> = ({ children }) => {
  const { staff } = useMobileAuth();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useBackgroundLocationReporter(staff?.id);

  useEffect(() => {
    if (staff) {
      queryClient.prefetchQuery({
        queryKey: ['mobile-inbox-all'],
        queryFn: () => mobileApi.getInboxAll(),
        staleTime: 30_000,
      });
    }
  }, [staff, queryClient]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  useEffect(() => {
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;
    const prevBodyOverscroll = document.body.style.overscrollBehaviorY;

    document.documentElement.style.backgroundColor = 'hsl(var(--primary))';
    document.body.style.backgroundColor = 'hsl(var(--primary))';
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';

    return () => {
      document.documentElement.style.backgroundColor = prevHtmlBg;
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.overscrollBehaviorY = prevHtmlOverscroll;
      document.body.style.overscrollBehaviorY = prevBodyOverscroll;
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-card">
      <div className="h-full max-w-lg mx-auto bg-card flex flex-col overflow-hidden">
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 16px)',
          }}
        >
          {children}
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
};

export default TimeAppLayout;
