import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import MobileBottomNav from '@/components/mobile-app/MobileBottomNav';
import MobileGlobalOverlays from '@/components/mobile-app/MobileGlobalOverlays';
import { GeofencingProvider } from '@/contexts/GeofencingContext';

interface TimeAppLayoutProps {
  children: React.ReactNode;
}

/**
 * TimeAppLayout — the native shell for EventFlow Time.
 * Owns the single scroll container for the time app to avoid
 * iOS viewport/body scroll jitter with fixed bottom navigation.
 *
 * All global mobile flows (assistant, arrival prompt, stale timer dialog,
 * travel banner, global timer banner, background location reporting,
 * inbox prefetch) are owned by <MobileGlobalOverlays /> — single source of
 * truth shared with MobileAppLayout.
 */
const TimeAppLayout: React.FC<TimeAppLayoutProps> = ({ children }) => {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

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
    <GeofencingProvider>
      <div className="time-app fixed inset-0 overflow-hidden bg-primary">
        <div className="h-full max-w-lg mx-auto bg-card flex flex-col overflow-hidden">
          {/* Header slot — headers portal in here so they sit OUTSIDE the scroll container.
              This avoids the iOS WKWebView bug where position: sticky inside a momentum-scrolling
              container jitters/lags behind the scroll.
              The slot itself paints the iOS safe-area (statusbar region) in primary so
              system icons (clock, battery, wifi) always sit on a solid colored bar — even
              on pages that don't render their own MobileHeader. */}
          <div
            id="mobile-header-slot"
            className="shrink-0 bg-primary z-[60]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          />
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
            style={{
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)',
            }}
          >
            {/* Global overlays — banners render here at top of scroll, dialogs portal to root. */}
            <MobileGlobalOverlays />
            {children}
          </div>
          <MobileBottomNav />
        </div>
      </div>
    </GeofencingProvider>
  );
};

export default TimeAppLayout;
