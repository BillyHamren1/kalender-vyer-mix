import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addDays, subDays, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useInternalLagerCalendarEvents } from '@/hooks/useInternalLagerCalendarEvents';

/**
 * Ops Control planeringsruta — visar EXAKT samma dagsvy (teamvy 06–23)
 * som personalkalendern i Planning. Återanvänder CustomCalendar med
 * viewMode="day" och samma data-hooks som CustomCalendarPage.
 *
 * Endast en dag, navigering med < Idag >.
 */
const OpsPlanningDayPanel: React.FC = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState<Date>(() => startOfDay(new Date()));

  const {
    events,
    setEvents,
    isLoading,
    isMounted,
    handleDatesSet,
    refreshEvents,
  } = useRealTimeCalendarEvents();

  const { internalLagerEvents } = useInternalLagerCalendarEvents(currentDate, 'day');
  const { teamResources } = useTeamResources();
  const staffOps = useUnifiedStaffOperations(currentDate, 'weekly', 'Montage');

  const mergedEvents = useMemo(() => {
    const filtered = events.filter((e: any) => e.resourceId !== 'transport');
    return [...filtered, ...internalLagerEvents];
  }, [events, internalLagerEvents]);

  // Per-day team visibility (same defaults as CustomCalendarPage)
  const [visibleTeamsByDay, setVisibleTeamsByDay] = useState<Record<string, string[]>>(() => {
    try {
      const stored = localStorage.getItem('visibleTeamsByDay');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('visibleTeamsByDay', JSON.stringify(visibleTeamsByDay));
  }, [visibleTeamsByDay]);

  const getVisibleTeamsForDay = (date: Date): string[] => {
    const key = format(date, 'yyyy-MM-dd');
    return visibleTeamsByDay[key] || ['team-1', 'team-2', 'team-3', 'team-4', 'transport', 'team-11'];
  };

  const handleToggleTeamForDay = (teamId: string, date: Date) => {
    const key = format(date, 'yyyy-MM-dd');
    setVisibleTeamsByDay(prev => {
      const current = prev[key] || ['team-1', 'team-2', 'team-3', 'team-4', 'transport', 'team-11'];
      if (current.includes(teamId)) {
        if (['team-1', 'team-2', 'team-3', 'team-4', 'team-11', 'transport'].includes(teamId)) {
          return prev;
        }
        return { ...prev, [key]: current.filter(id => id !== teamId) };
      }
      return { ...prev, [key]: [...current, teamId] };
    });
  };

  const isToday = format(currentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const label = isToday ? 'Idag' : format(currentDate, 'EEE d MMM', { locale: sv });

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className="group flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            title="Öppna hela personalkalendern"
          >
            PERSONALKALENDER
            <Maximize2 className="h-3 w-3 opacity-60 group-hover:opacity-100" />
          </button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentDate(prev => subDays(prev, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setCurrentDate(startOfDay(new Date()))}
            >
              {label}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentDate(prev => addDays(prev, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendar */}
        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-border bg-card">
          <CustomCalendar
            events={mergedEvents}
            setEvents={setEvents}
            resources={teamResources}
            isLoading={isLoading}
            isMounted={isMounted}
            currentDate={currentDate}
            onDateSet={handleDatesSet}
            refreshEvents={refreshEvents}
            onStaffDrop={staffOps.handleStaffDrop}
            viewMode="day"
            weeklyStaffOperations={staffOps}
            getVisibleTeamsForDay={getVisibleTeamsForDay}
            onToggleTeamForDay={handleToggleTeamForDay}
            allTeams={teamResources}
          />
        </div>
      </div>
    </TooltipProvider>
  );
};

export default OpsPlanningDayPanel;
