import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
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
  endOfWeek,
  parseISO
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

interface JobDay {
  date: Date;
  rigJobs: number;
  eventJobs: number;
  rigdownJobs: number;
}

const JobOverviewCalendar = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

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
    <Card className="bg-card shadow-lg border border-border/60">
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
              onClick={handlePrevMonth}
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
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekDays.map(day => (
            <div 
              key={day} 
              className="text-center text-xs font-medium text-muted-foreground py-1"
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

              return (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>
                    <div
                      className={`
                        aspect-square rounded-md flex flex-col items-center justify-center
                        text-xs transition-colors cursor-default relative
                        ${getDayBackground(day, inCurrentMonth)}
                        ${!inCurrentMonth ? 'text-muted-foreground/50' : 'text-foreground'}
                        ${today ? 'ring-2 ring-warehouse ring-offset-1' : ''}
                      `}
                    >
                      <span className={`${today ? 'font-bold' : ''}`}>
                        {format(day.date, 'd')}
                      </span>
                      {total > 0 && inCurrentMonth && (
                        <div className="flex gap-0.5 mt-0.5">
                          {day.rigJobs > 0 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          )}
                          {day.eventJobs > 0 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          )}
                          {day.rigdownJobs > 0 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
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
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
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
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            {day.rigdownJobs} nedrigg
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Montage</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Event</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span>Nedrigg</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default JobOverviewCalendar;
