import React, { useEffect } from 'react';
import MobileBottomNav from './MobileBottomNav';
import MobileGlobalOverlays from './MobileGlobalOverlays';
import { ViewAsBanner } from './ViewAsPicker';
import { GeofencingProvider } from '@/contexts/GeofencingContext';
import { useAppHealthReporter } from '@/hooks/useAppHealthReporter';

interface MobileAppLayoutProps {
  children: React.ReactNode;
}

/**
 * MobileAppLayout — web-fallback shell used by `/m/*` routes.
 *
 * All global mobile flows (assistant, arrival prompt, stale timer dialog,
 * travel banner, global timer banner, background location reporting,
 * inbox prefetch) live in <MobileGlobalOverlays /> — single source of truth
 * shared with TimeAppLayout (native EventFlow Time shell).
 */
const MobileAppLayout: React.FC<MobileAppLayoutProps> = ({ children }) => {
  // Paint the document background teal so iOS rubber-band overscroll at the
  // top reveals the same colour as the sticky header (no white flash), and
  // disable overscroll bounce so the header doesn't get dragged away.
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
      <div
        className="bg-card max-w-lg mx-auto fixed inset-0 overflow-y-auto overscroll-none"
        style={{ WebkitOverflowScrolling: 'touch' as any }}
      >
        {/* Solid primary bar behind the iOS statusbar so system icons (clock,
            battery, wifi) always sit on a colored background even on pages
            that don't render their own MobileHeader. */}
        <div
          className="sticky top-0 z-[55] bg-primary"
          style={{ height: 'env(safe-area-inset-top, 0px)' }}
        />
        <div style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 16px)' }}>
          {/* Global overlays — banners render here at top of content, dialogs portal to root. */}
          <MobileGlobalOverlays />
          <ViewAsBanner />
          {children}
        </div>

        <MobileBottomNav />
      </div>
    </GeofencingProvider>
  );
};

export default MobileAppLayout;
