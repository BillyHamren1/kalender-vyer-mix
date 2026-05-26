import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { startOfWeek, addDays, format, isSameWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useInternalLagerCalendarEvents } from '@/hooks/useInternalLagerCalendarEvents';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import PersonalkalendernAuthGate from '@/auth/PersonalkalendernAuthGate';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

const monday = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

const PersonalkalendernInner: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { staff, logout: mobileLogout } = useMobileAuth();

  // Defaultvy: alltid veckovy med dagens dag synlig
  const [weekStart, setWeekStart] = useState<Date>(() => monday(new Date()));

  // Återställ till denna vecka om användaren laddar om dag senare
  useEffect(() => {
    const today = new Date();
    if (!isSameWeek(weekStart, today, { weekStartsOn: 1 })) {
      // Behåll val om användaren manuellt navigerat — initial mount only
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { events, isLoading, isMounted, refreshEvents } = useRealTimeCalendarEvents();
  const { teamResources } = useTeamResources();
  const { internalLagerEvents } = useInternalLagerCalendarEvents(weekStart, 'weekly');

  const mergedEvents = useMemo(() => {
    const filtered = events.filter((e: any) => e.resourceId !== 'transport');
    return [...filtered, ...internalLagerEvents];
  }, [events, internalLagerEvents]);

  // Alla event är read-only i denna vy
  const isEventReadOnly = useCallback(() => true, []);

  const handleDateSet = useCallback(() => { /* no-op (read-only) */ }, []);

  const goPrev = () => setWeekStart((w) => addDays(w, -7));
  const goNext = () => setWeekStart((w) => addDays(w, 7));
  const goToday = () => setWeekStart(monday(new Date()));

  const handleLogout = async () => {
    if (user) await supabase.auth.signOut();
    if (staff) mobileLogout();
    navigate('/personalkalendern/login', { replace: true });
  };

  const weekLabel = `Vecka ${format(weekStart, 'I', { locale: sv })} · ${format(weekStart, 'd MMM', { locale: sv })}–${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: sv })}`;
  const viewerName = staff?.name ?? user?.email ?? '';

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
          <div className="px-3 sm:px-6 py-2 flex items-center gap-2 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-2 mr-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              <h1 className="text-base sm:text-lg font-semibold text-foreground">Personalkalendern</h1>
              <span className="hidden sm:inline text-xs text-muted-foreground ml-1 px-1.5 py-0.5 rounded bg-muted">
                Read-only
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={goPrev} aria-label="Föregående vecka">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Idag
              </Button>
              <Button variant="ghost" size="sm" onClick={goNext} aria-label="Nästa vecka">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-sm text-muted-foreground tabular-nums">
              {weekLabel}
            </div>

            <div className="flex-1" />

            {viewerName && (
              <span className="hidden sm:inline text-xs text-muted-foreground truncate max-w-[200px]">
                {viewerName}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Logga ut</span>
            </Button>
          </div>
        </header>

        {/* Kalender */}
        <main className="flex-1 overflow-hidden">
          <div className="h-full w-full">
            <CustomCalendar
              events={mergedEvents}
              resources={teamResources}
              isLoading={isLoading}
              isMounted={isMounted}
              currentDate={weekStart}
              onDateSet={handleDateSet}
              refreshEvents={refreshEvents}
              viewMode="weekly"
              isEventReadOnly={isEventReadOnly}
              timeGridFullWidth={false}
              // Inga callbacks → alla edit-paths inaktiverade
            />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
};

const PersonalkalendernPage: React.FC = () => (
  <PersonalkalendernAuthGate>
    <PersonalkalendernInner />
  </PersonalkalendernAuthGate>
);

export default PersonalkalendernPage;
