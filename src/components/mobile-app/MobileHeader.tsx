import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* ============================================================
 * MobileHeader — unified header system for EventFlow Time
 *
 * Timer styrs endast av godkända arbetsdagstimer-komponenter:
 * CompactWorkDayTimer i jobb-headern och WorkDayPanel där den
 * fortfarande används. Jobbkort, projektkort och platskort får
 * inte starta/stoppa timer.
 *
 * Headers portal into #mobile-header-slot (rendered by TimeAppLayout)
 * so they sit OUTSIDE the scroll container — avoids iOS WKWebView
 * `position: sticky` jitter inside momentum-scrolling elements.
 * ============================================================ */

const useMobileHeaderSlot = (): HTMLElement | null => {
  const [slot, setSlot] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' ? document.getElementById('mobile-header-slot') : null
  );

  useEffect(() => {
    if (slot) return;
    let raf = 0;
    const tryFind = () => {
      const el = document.getElementById('mobile-header-slot');
      if (el) setSlot(el);
      else raf = requestAnimationFrame(tryFind);
    };
    raf = requestAnimationFrame(tryFind);
    return () => cancelAnimationFrame(raf);
  }, [slot]);

  return slot;
};

/**
 * HeaderStartEndDayButton
 *
 * Borttagen som interaktiv yta. Returnerar null för att behålla
 * import-kontraktet i sidor som fortfarande mountar den. All
 * arbetsdagsstart/-stopp sker via godkända timer-komponenter
 * (CompactWorkDayTimer / WorkDayPanel).
 */
export const HeaderStartEndDayButton: React.FC = () => null;

/** Wraps header markup with a portal to the slot, falling back to inline. */
export const HeaderShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const slot = useMobileHeaderSlot();
  const content = (
    <div
      className="relative rounded-b-[28px] shadow-[0_6px_20px_-12px_hsl(184_60%_22%/0.45)]"
      style={{
        background:
          'linear-gradient(180deg, hsl(184 58% 36%) 0%, hsl(184 55% 38%) 55%, hsl(184 52% 40%) 100%)',
      }}
    >
      {children}
    </div>
  );
  if (slot) return createPortal(content, slot);
  return (
    <div
      className="sticky top-0 z-[60]"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'hsl(184 58% 36%)',
      }}
    >
      {content}
    </div>
  );
};

/* ---- Variant: Hero ---- */
interface HeroHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}

export const MobileHeroHeader: React.FC<HeroHeaderProps> = ({ eyebrow, title, subtitle, rightAction }) => (
  <HeaderShell>
    <div className="px-5 pt-1.5 pb-2.5 flex flex-col justify-end">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-primary-foreground/70 text-[10px] font-semibold tracking-widest uppercase leading-none">{eyebrow}</p>
          )}
          <h1 className="text-base font-extrabold text-primary-foreground tracking-tight leading-tight mt-0.5 truncate">{title}</h1>
          {subtitle && (
            <p className="text-[11px] text-primary-foreground/60 font-medium leading-tight mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {rightAction && <div className="shrink-0">{rightAction}</div>}
      </div>
    </div>
  </HeaderShell>
);

/* ---- Variant: Back header (inner pages) ---- */
interface BackHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  titlePrefix?: React.ReactNode;
}

export const MobileBackHeader: React.FC<BackHeaderProps> = ({
  title, subtitle, backTo, onBack, rightAction, titlePrefix,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) { onBack(); return; }
    if (backTo) { navigate(backTo); return; }
    navigate(-1);
  };

  return (
    <HeaderShell>
      <div className="px-5 pt-1.5 pb-2.5 flex flex-col justify-end">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-1.5 -ml-1.5 rounded-xl active:scale-95 transition-all"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          {titlePrefix}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold text-primary-foreground truncate tracking-tight leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-[11px] text-primary-foreground/50 font-medium leading-tight">{subtitle}</p>
            )}
          </div>
          {rightAction && <div className="shrink-0 flex items-center gap-2">{rightAction}</div>}
        </div>
      </div>
    </HeaderShell>
  );
};

/* ---- Variant: Profile hero ---- */
interface ProfileHeaderProps {
  avatar?: React.ReactNode;
  name: string;
  role?: string | null;
}

export const MobileProfileHeader: React.FC<ProfileHeaderProps> = ({ avatar, name, role }) => (
  <HeaderShell>
    <div className="px-5 pt-1.5 pb-3">
      <div className="flex flex-col items-center">
        {avatar || (
          <div className="w-12 h-12 rounded-2xl bg-primary-foreground/15 border border-primary-foreground/15 flex items-center justify-center mb-1.5">
            <span className="text-xl font-bold text-primary-foreground">{name.charAt(0)}</span>
          </div>
        )}
        <h1 className="text-base font-extrabold text-primary-foreground tracking-tight leading-tight">{name}</h1>
        {role && (
          <p className="text-[11px] text-primary-foreground/60 mt-0.5 font-medium leading-tight">{role}</p>
        )}
      </div>
    </div>
  </HeaderShell>
);
