import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, List, Loader2, RefreshCw, UserCircle2 } from 'lucide-react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileJobCatalog } from '@/hooks/useMobileData';
import { HeaderShell } from '@/components/mobile-app/MobileHeader';
import CalendarDateNav from '@/components/mobile-app/calendar/CalendarDateNav';
import MobileMonthView from '@/components/mobile-app/calendar/MobileMonthView';
import MobileJobDirectoryList from '@/components/mobile-app/calendar/MobileJobDirectoryList';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

type OverviewMode = 'list' | 'calendar';
const MODE_KEY = 'mobile.jobsOverviewMode';

/**
 * Organization-wide job browser for the Time app.
 *
 * This page deliberately uses get_job_catalog, not get_bookings:
 * - get_job_catalog = read-only organization job directory
 * - get_bookings    = personal planning input for Time Engine / Quick Entry
 *
 * Keeping those sources separate prevents browsing all jobs from accidentally
 * becoming permission to report time against or mutate every job.
 */
const MobileJobs = () => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { t } = useLanguage();
  const { data, isLoading, isRefetching, refetch } = useMobileJobCatalog();
  const bookings = data?.bookings ?? [];
  const shifts = data?.shifts ?? [];

  const [mode, setMode] = useState<OverviewMode>(() =>
    localStorage.getItem(MODE_KEY) === 'calendar' ? 'calendar' : 'list',
  );
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  useEffect(() => { localStorage.setItem(MODE_KEY, mode); }, [mode]);

  const counts = useMemo(() => ({ jobs: bookings.length }), [bookings.length]);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <HeaderShell>
        <div className="px-5 pt-2 pb-4">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => refetch()}
              className="p-2 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all"
              aria-label="Uppdatera jobb"
            >
              <RefreshCw className={cn('w-4 h-4 text-primary-foreground/85', isRefetching && 'animate-spin')} />
            </button>

            <div className="text-center min-w-0">
              <p className="text-primary-foreground/65 text-[10px] font-semibold tracking-[0.16em] uppercase">Jobb</p>
              <h1 className="text-lg font-extrabold text-primary-foreground tracking-tight">Översikt</h1>
            </div>

            <button
              onClick={() => navigate('/m/profile')}
              className="p-1.5 rounded-xl active:bg-primary-foreground/10 transition-all"
              aria-label="Min profil"
            >
              <UserCircle2 className="w-7 h-7 text-primary-foreground/90" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-primary-foreground/70">
            {isLoading ? 'Hämtar jobb…' : `${counts.jobs} jobb i organisationen`}
            {staff?.name ? ` · ${staff.name.split(' ')[0]}` : ''}
          </p>
        </div>
      </HeaderShell>

      <main className="flex-1 px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/70 p-1">
          <button
            type="button"
            onClick={() => setMode('list')}
            className={cn(
              'h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all',
              mode === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            <List className="w-4 h-4" />
            Lista
          </button>
          <button
            type="button"
            onClick={() => setMode('calendar')}
            className={cn(
              'h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all',
              mode === 'calendar' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            <CalendarDays className="w-4 h-4" />
            Kalender
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : mode === 'list' ? (
          <MobileJobDirectoryList bookings={bookings} />
        ) : (
          <div className="space-y-4">
            <CalendarDateNav
              viewMode="month"
              selectedDate={selectedDate}
              onChange={setSelectedDate}
            />
            <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
              <MobileMonthView
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                shifts={shifts}
              />
            </div>
            <MobileJobDirectoryList bookings={bookings} selectedDate={selectedDate} compactHeader />
          </div>
        )}
      </main>
    </div>
  );
};

export default MobileJobs;
