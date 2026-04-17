import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

/* ============================================================
 * MobileHeader — unified header system for EventFlow Time
 *
 * Design tokens (standardised across all variants):
 *   - Safe area:       env(safe-area-inset-top, 0px) via spacer div
 *   - Background:      bg-primary (solid teal)
 *   - Corner radius:   rounded-b-2xl
 *   - Shadow:          shadow-md
 *   - Horizontal pad:  px-5
 *   - Bottom pad:      pb-5  (hero / page)  |  pb-4 (compact back-nav)
 *   - Title size:      text-xl font-extrabold (hero)
 *                      text-lg font-extrabold (back / profile)
 *   - Subtitle:        text-xs text-primary-foreground/60
 * ============================================================ */

/* ---- Variant: Hero ---- */
interface HeroHeaderProps {
  /** Small caps label above the title, e.g. "Välkommen" */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Action element rendered on the right (icon button, badge, etc.) */
  rightAction?: React.ReactNode;
}

export const MobileHeroHeader: React.FC<HeroHeaderProps> = ({ eyebrow, title, subtitle, rightAction }) => (
  <div
    className="bg-primary sticky top-0 z-40 shadow-sm"
    style={{
      paddingTop: 'env(safe-area-inset-top, 0px)',
      // iOS Safari: ensure sticky works inside flex/scroll containers by promoting to its own layer
      WebkitTransform: 'translateZ(0)',
      transform: 'translateZ(0)',
      willChange: 'transform',
    }}
  >
    <div className="px-5 pt-2 pb-3 flex flex-col justify-end">
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
  </div>
);

/* ---- Variant: Back header (inner pages) ---- */
interface BackHeaderProps {
  title: string;
  subtitle?: string;
  /** Override back destination. Defaults to browser back. */
  backTo?: string;
  /** Called before navigating back, e.g. to confirm unsaved changes */
  onBack?: () => void;
  /** Action element(s) rendered on the right */
  rightAction?: React.ReactNode;
  /** Extra elements rendered between back-button and title (icons, avatars) */
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
    <div
      className="bg-primary sticky top-0 z-40 shadow-sm"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        WebkitTransform: 'translateZ(0)',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
    >
      <div className="px-5 pt-2 pb-3 flex flex-col justify-end">
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
    </div>
  );
};

/* ---- Variant: Profile hero ---- */
interface ProfileHeaderProps {
  /** Avatar content — defaults to first letter of name */
  avatar?: React.ReactNode;
  name: string;
  role?: string | null;
}

export const MobileProfileHeader: React.FC<ProfileHeaderProps> = ({ avatar, name, role }) => (
  <div
    className="bg-primary sticky top-0 z-40 shadow-sm"
    style={{
      paddingTop: 'env(safe-area-inset-top, 0px)',
      WebkitTransform: 'translateZ(0)',
      transform: 'translateZ(0)',
      willChange: 'transform',
    }}
  >
    <div className="px-5 pt-2 pb-4">
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
  </div>
);
