import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Loader2, LogOut, Play } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import WorkDayHeaderTimer from './WorkDayHeaderTimer';
import { useWorkDay } from '@/hooks/useWorkDay';
import { clearWorkdayEnded } from '@/services/workdayState';
import { useLanguage } from '@/i18n/LanguageContext';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { useGeofencingContext } from '@/contexts/GeofencingContext';
import { useTimerStartFlow } from '@/hooks/useTimerStartFlow';
import { haversineDistance, ENTER_RADIUS } from '@/hooks/useGeofencing';
import { mobileApi } from '@/services/mobileApiService';
import StartDayDialog, { type StartDaySelection } from './StartDayDialog';
import type { MobileBooking } from '@/services/mobileApiService';

/* ============================================================
 * MobileHeader — unified header system for EventFlow Time
 *
 * Headers portal into #mobile-header-slot (rendered by TimeAppLayout)
 * so they sit OUTSIDE the scroll container. This avoids a long-standing
 * iOS WKWebView bug where `position: sticky` inside a momentum-scrolling
 * element jitters / lags behind the scroll.
 *
 * If the slot is not present (e.g. Scanner shell), headers render
 * inline as a graceful fallback.
 * ============================================================ */

/** Resolves the portal slot, retrying on first paint until it exists. */
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
 * HeaderWorkdayControls
 *
 * Visar ENDAST WorkDayHeaderTimer (dag-klockan) när dagen är öppen.
 * Start/Avsluta dag-knappen renderas inline i sidans header
 * (se `HeaderStartEndDayButton`) — inte som en egen rad här.
 */
const HeaderWorkdayControls: React.FC = () => {
  const { current } = useWorkDay();
  const workdayOpen = !!current && !current.ended_at;

  if (!workdayOpen) return null;

  return (
    <div className="w-full px-4 pt-2 pb-1 flex justify-center bg-primary">
      <WorkDayHeaderTimer />
    </div>
  );
};

/**
 * HeaderStartEndDayButton
 *
 * Kompakt ikon-knapp som placeras inline i sidans header-rad
 * (mellan andra header-actions). Visar Play när dagen ej är öppen
 * och LogOut när den är öppen.
 */
export const HeaderStartEndDayButton: React.FC = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const { current, start } = useWorkDay();
  const workdayOpen = !!current && !current.ended_at;
  const [startingDay, setStartingDay] = useState(false);

  // Göm på rapport-sidan (samma policy som tidigare)
  if (location.pathname === '/m/report') return null;

/**
 * Försöker hitta en booking/projekt som matchar användarens GPS-position.
 * Returnerar närmaste träff inom ENTER_RADIUS, eller null.
 */
function findNearbyBooking(
  bookings: MobileBooking[],
  pos: { lat: number; lng: number } | null,
): MobileBooking | null {
  if (!pos) return null;
  let best: { b: MobileBooking; dist: number } | null = null;
  for (const b of bookings) {
    if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
    const dist = haversineDistance(pos.lat, pos.lng, b.delivery_latitude, b.delivery_longitude);
    if (dist <= ENTER_RADIUS && (!best || dist < best.dist)) {
      best = { b, dist };
    }
  }
  return best?.b ?? null;
}

/** Vänta upp till `timeoutMs` på en GPS-position. */
function waitForPosition(
  getPos: () => { lat: number; lng: number } | null,
  timeoutMs = 3000,
  pollMs = 200,
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const p = getPos();
      if (p) return resolve(p);
      if (Date.now() - start >= timeoutMs) return resolve(null);
      setTimeout(tick, pollMs);
    };
    tick();
  });
}

export const HeaderStartEndDayButton: React.FC = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const { staff } = useMobileAuth();
  const { current, start } = useWorkDay();
  const { data: bookings = [] } = useMobileBookings();
  const { userPosition } = useGeofencingContext();
  const { requestStart } = useTimerStartFlow(bookings, staff?.id);

  const workdayOpen = !!current && !current.ended_at;
  const [startingDay, setStartingDay] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Göm på rapport-sidan (samma policy som tidigare)
  if (location.pathname === '/m/report') return null;

  /**
   * Steg 1: Snabb GPS-poll (≤3s). Om vi hittar en bookning vid den platsen
   *         → auto-starta workday + timer direkt utan dialog.
   *         Annars → öppna StartDayDialog så användaren MÅSTE välja något.
   */
  const handleStartDay = useCallback(async () => {
    if (startingDay || workdayOpen) return;
    setStartingDay(true);
    try {
      clearWorkdayEnded();
      // Försök fånga en GPS-fix snabbt (faller tillbaka direkt om den saknas)
      const pos = userPosition ?? await waitForPosition(() => userPosition);
      const match = findNearbyBooking(bookings, pos);

      if (match) {
        // Auto-träff: starta dagen + aktivitetstimer omedelbart.
        const target = match.large_project_id && match.large_project_name
          ? { kind: 'project' as const, largeProjectId: match.large_project_id, name: match.large_project_name }
          : { kind: 'booking' as const, bookingId: match.id, client: match.client };
        const label = match.large_project_name || match.client;
        // requestStart säkerställer workday + startar timer (workday-first).
        const result = requestStart(target, { label });
        if (result === 'started' || result === 'duplicate') {
          toast.success(`Dagen startad på ${label}`);
        }
        // 'conflict' hanteras av globala TimerConflictDialog.
        return;
      }

      // Ingen match → låt användaren välja
      setDialogOpen(true);
    } finally {
      setStartingDay(false);
    }
  }, [startingDay, workdayOpen, userPosition, bookings, requestStart]);

  /**
   * Användaren har valt något i dialogen.
   *   - 'target' → samma flöde som auto-match (workday + timer)
   *   - 'manual' → starta workday + skapa workday_flag (unclear_start_target).
   *                Ingen aktivitetstimer; arbetsledare måste reda ut.
   */
  const handleDialogConfirm = useCallback(async (selection: StartDaySelection) => {
    setStartingDay(true);
    try {
      if (selection.kind === 'target') {
        const result = requestStart(selection.target, { label: selection.label });
        if (result === 'started' || result === 'duplicate') {
          toast.success(`Dagen startad på ${selection.label}`);
          setDialogOpen(false);
        } else if (result === 'conflict') {
          // Globala TimerConflictDialog tar över; stäng vår dialog.
          setDialogOpen(false);
        }
        return;
      }

      // Manuell text: workday-first, sedan flagga.
      const wd = await start();
      if (!wd) {
        toast.error('Kunde inte starta arbetsdagen. Försök igen.');
        return;
      }
      try {
        await mobileApi.createWorkdayFlag({
          flag_type: 'unclear_start_target' as any,
          flag_date: new Date().toISOString().slice(0, 10),
          title: 'Oklart startprojekt',
          description: selection.text,
          severity: 'warning',
          needs_user_input: false,
          context: { entered_text: selection.text, source: 'start_day_manual' },
        });
      } catch (err) {
        console.warn('[StartDay] createWorkdayFlag failed (non-fatal):', err);
      }
      toast.success('Dagen startad. Arbetsledare kopplar projekt åt dig.');
      setDialogOpen(false);
    } finally {
      setStartingDay(false);
    }
  }, [requestStart, start]);

  if (workdayOpen) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('request-end-day'))}
        className="p-2.5 rounded-xl bg-destructive/90 text-destructive-foreground active:scale-95 transition-all"
        title={t('workday.endDayTitle')}
        aria-label={t('workday.endDay')}
      >
        <LogOut className="w-4.5 h-4.5" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleStartDay}
        disabled={startingDay}
        className="p-2.5 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all disabled:opacity-60"
        title={t('workday.startDayTitle')}
        aria-label={startingDay ? t('workday.starting') : t('workday.startDay')}
      >
        {startingDay
          ? <Loader2 className="w-4.5 h-4.5 text-primary-foreground/80 animate-spin" />
          : <Play className="w-4.5 h-4.5 text-primary-foreground/80" />}
      </button>
      <StartDayDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDialogConfirm}
        bookings={bookings}
        starting={startingDay}
      />
    </>
  );
};

/** Wraps header markup with a portal to the slot, falling back to inline. */
export const HeaderShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const slot = useMobileHeaderSlot();
  const content = (
    <div
      className="relative bg-primary shadow-sm"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <HeaderWorkdayControls />
      {children}
    </div>
  );
  if (slot) return createPortal(content, slot);
  // Fallback: render inline (non-Time shells)
  return <div className="sticky top-0 z-[60]">{content}</div>;
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
