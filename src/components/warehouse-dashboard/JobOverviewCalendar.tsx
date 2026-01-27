import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, Maximize2, X } from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from "date-fns";
import { sv } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface JobDay {
  date: Date;
  rigJobs: number;
  eventJobs: number;
  rigdownJobs: number;
}

const JobOverviewCalendar = () => {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Fetch all jobs for the visible calendar range
  const jobsQuery = useQuery({
    queryKey: ['calendar-overview-jobs', format(calendarStart, 'yyyy-MM-dd'), format(calendarEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const startStr = format(calendarStart, 'yyyy-MM-dd');
      const endStr = format(calendarEnd, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('bookings')
        .select('id, client, rigdaydate, eventdate, rigdowndate, status')
        .eq('status', 'CONFIRMED')
        .or(`rigdaydate.gte.${startStr},eventdate.gte.${startStr},rigdowndate.gte.${startStr}`)
        .or(`rigdaydate.lte.${endStr},eventdate.lte.${endStr},rigdowndate.lte.${endStr}`);

      if (error) throw error;
      return data || [];
    }
  });

  // Process jobs into day counts
  const jobDays = useMemo(() => {
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const jobData = jobsQuery.data || [];

    return days.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const rigJobs = jobData.filter(j => j.rigdaydate === dateStr).length;
      const eventJobs = jobData.filter(j => j.eventdate === dateStr).length;
      const rigdownJobs = jobData.filter(j => j.rigdowndate === dateStr).length;

      return {
        date,
        rigJobs,
        eventJobs,
        rigdownJobs
      };
    });
  }, [jobsQuery.data, calendarStart, calendarEnd]);

  const weekDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  const getTotalJobs = (day: JobDay) => day.rigJobs + day.eventJobs + day.rigdownJobs;

  const getDayBackground = (day: JobDay, inCurrentMonth: boolean) => {
    if (!inCurrentMonth) return 'bg-muted/30';
    
    const total = getTotalJobs(day);
    if (total === 0) return 'bg-background';
    if (total === 1) return 'bg-warehouse/20';
    if (total === 2) return 'bg-warehouse/40';
    return 'bg-warehouse/60';
  };

  const handleDayClick = (day: JobDay) => {
    const total = getTotalJobs(day);
    if (total > 0) {
      // Navigate to warehouse calendar with the selected date
      const dateStr = format(day.date, 'yyyy-MM-dd');
      navigate(`/warehouse/calendar?date=${dateStr}&view=day`);
    }
  };

  const renderCalendarGrid = (isLarge: boolean = false) => (
    <>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map(day => (
          <div 
            key={day} 
            className={`text-center font-medium text-muted-foreground py-1 ${isLarge ? 'text-sm' : 'text-xs'}`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <TooltipProvider>
        <div className="grid grid-cols-7 gap-1">
          {jobDays.map((day, idx) => {
            const inCurrentMonth = isSameMonth(day.date, currentMonth);
            const today = isToday(day.date);
            const total = getTotalJobs(day);
            const isClickable = total > 0 && inCurrentMonth;

            return (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div
                    onClick={() => isClickable && handleDayClick(day)}
                    className={`
                      ${isLarge ? 'aspect-square min-h-[60px]' : 'aspect-square'}
                      rounded-md flex flex-col items-center justify-center
                      ${isLarge ? 'text-sm' : 'text-xs'} transition-all relative
                      ${getDayBackground(day, inCurrentMonth)}
                      ${!inCurrentMonth ? 'text-muted-foreground/50' : 'text-foreground'}
                      ${today ? 'ring-2 ring-warehouse ring-offset-1' : ''}
                      ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-warehouse/50 hover:scale-105' : 'cursor-default'}
                    `}
                  >
                    <span className={`${today ? 'font-bold' : ''}`}>
                      {format(day.date, 'd')}
                    </span>
                    {total > 0 && inCurrentMonth && (
                      <div className={`flex gap-0.5 mt-0.5 ${isLarge ? 'gap-1 mt-1' : ''}`}>
                        {day.rigJobs > 0 && (
                          <div className={`rounded-full bg-sky-500 ${isLarge ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} />
                        )}
                        {day.eventJobs > 0 && (
                          <div className={`rounded-full bg-amber-500 ${isLarge ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} />
                        )}
                        {day.rigdownJobs > 0 && (
                          <div className={`rounded-full bg-emerald-500 ${isLarge ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} />
                        )}
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {total > 0 && inCurrentMonth && (
                  <TooltipContent side="top" className="text-xs">
                    <div className="space-y-1">
                      <p className="font-medium">{format(day.date, 'd MMMM', { locale: sv })}</p>
                      {day.rigJobs > 0 && (
                        <p className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-sky-500" />
                          {day.rigJobs} montage
                        </p>
                      )}
                      {day.eventJobs > 0 && (
                        <p className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          {day.eventJobs} event
                        </p>
                      )}
                      {day.rigdownJobs > 0 && (
                        <p className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {day.rigdownJobs} nedrigg
                        </p>
                      )}
                      <p className="text-muted-foreground text-[10px] pt-1 border-t border-border/50">
                        Klicka för att öppna dagsvyn
                      </p>
                    </div>
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Legend */}
      <div className={`flex items-center justify-center gap-4 mt-4 pt-3 border-t border-border/40 ${isLarge ? 'text-sm' : 'text-xs'}`}>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <div className={`rounded-full bg-sky-500 ${isLarge ? 'w-3 h-3' : 'w-2.5 h-2.5'}`} />
          <span>Montage</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <div className={`rounded-full bg-amber-500 ${isLarge ? 'w-3 h-3' : 'w-2.5 h-2.5'}`} />
          <span>Event</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <div className={`rounded-full bg-emerald-500 ${isLarge ? 'w-3 h-3' : 'w-2.5 h-2.5'}`} />
          <span>Nedrigg</span>
        </div>
      </div>
    </>
  );

  if (jobsQuery.isLoading) {
    return (
      <Card className="bg-card shadow-lg border border-border/60">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CalendarDays className="h-5 w-5 text-warehouse" />
            Jobbkalender
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Compact card view */}
      <Card 
        className="bg-card shadow-lg border border-border/60 cursor-pointer hover:shadow-xl transition-shadow group"
        onClick={() => setIsFullscreen(true)}
      >
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarDays className="h-5 w-5 text-warehouse" />
              Jobbkalender
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevMonth();
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[100px] text-center">
                {format(currentMonth, 'MMMM yyyy', { locale: sv })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextMonth();
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Maximize2 className="h-4 w-4 text-muted-foreground ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {renderCalendarGrid(false)}
        </CardContent>
      </Card>

      {/* Fullscreen dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-6 w-6 text-warehouse" />
                <span>Jobbkalender - Överblick</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handlePrevMonth}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-base font-medium min-w-[140px] text-center">
                  {format(currentMonth, 'MMMM yyyy', { locale: sv })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleNextMonth}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            {renderCalendarGrid(true)}
            <p className="text-center text-sm text-muted-foreground mt-4">
              Klicka på en dag med jobb för att öppna endagsvy i lagerkalendern
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobOverviewCalendar;
