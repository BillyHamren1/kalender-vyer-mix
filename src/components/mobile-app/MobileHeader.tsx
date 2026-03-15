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
  <div className="bg-primary rounded-b-2xl shadow-md">
    <div className="safe-area-top" style={{ minHeight: '44px' }} />
    <div className="px-5 pb-5">
      <div className="flex items-center justify-between">
        <div>
          {eyebrow && (
            <p className="text-primary-foreground/70 text-[11px] font-semibold tracking-widest uppercase">{eyebrow}</p>
          )}
          <h1 className="text-xl font-extrabold text-primary-foreground tracking-tight leading-tight mt-0.5">{title}</h1>
          {subtitle && (
            <p className="text-xs text-primary-foreground/60 font-medium mt-0.5">{subtitle}</p>
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
    <div className="bg-primary rounded-b-2xl shadow-md">
      <div className="safe-area-top" style={{ minHeight: '44px' }} />
      <div className="px-5 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl active:scale-95 transition-all"
            aria-label="Tillbaka"
          >
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          {titlePrefix}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-primary-foreground truncate tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-[11px] text-primary-foreground/50 font-medium">{subtitle}</p>
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
  <div className="bg-primary rounded-b-2xl shadow-md">
    <div className="safe-area-top" style={{ minHeight: '44px' }} />
    <div className="px-5 pb-6">
      <div className="flex flex-col items-center">
        {avatar || (
          <div className="w-16 h-16 rounded-2xl bg-primary-foreground/15 border border-primary-foreground/15 flex items-center justify-center mb-2.5">
            <span className="text-2xl font-bold text-primary-foreground">{name.charAt(0)}</span>
          </div>
        )}
        <h1 className="text-lg font-extrabold text-primary-foreground tracking-tight">{name}</h1>
        {role && (
          <p className="text-xs text-primary-foreground/60 mt-0.5 font-medium">{role}</p>
        )}
      </div>
    </div>
  </div>
);
