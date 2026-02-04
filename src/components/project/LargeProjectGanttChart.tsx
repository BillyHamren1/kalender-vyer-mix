import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GanttChart, Edit, Calendar, Info } from 'lucide-react';
import { format, differenceInDays, isWithinInterval, isBefore, isAfter } from 'date-fns';
import { sv } from 'date-fns/locale';

export interface GanttStep {
  id?: string;
  key: string;
  name: string;
  start_date: string;
  end_date: string;
  is_milestone: boolean;
  sort_order?: number;
}

interface LargeProjectGanttChartProps {
  steps: GanttStep[];
  onEdit?: () => void;
}

export const LargeProjectGanttChart: React.FC<LargeProjectGanttChartProps> = ({
  steps,
  onEdit
}) => {
  if (steps.length === 0) {
    return null;
  }

  // Calculate timeline bounds
  const allDates = steps.flatMap(s => [new Date(s.start_date), new Date(s.end_date)]);
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  const totalDays = differenceInDays(maxDate, minDate) + 1;
  const today = new Date();

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'd MMM', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  const getBarPosition = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const left = (differenceInDays(start, minDate) / totalDays) * 100;
    const width = ((differenceInDays(end, start) + 1) / totalDays) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 3)}%` };
  };

  const getStepStatus = (step: GanttStep) => {
    const start = new Date(step.start_date);
    const end = new Date(step.end_date);
    
    if (isBefore(today, start)) {
      return 'upcoming';
    } else if (isAfter(today, end)) {
      return 'completed';
    } else {
      return 'active';
    }
  };

  const statusColors = {
    upcoming: 'bg-muted border-muted-foreground/30',
    active: 'bg-primary border-primary',
    completed: 'bg-green-500 border-green-600'
  };

  // Today marker position
  const todayPosition = isWithinInterval(today, { start: minDate, end: maxDate })
    ? (differenceInDays(today, minDate) / totalDays) * 100
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GanttChart className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Projektschema</CardTitle>
          </div>
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-1" />
              Redigera
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Timeline header */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(minDate, 'd MMMM yyyy', { locale: sv })}
          </span>
          <span className="flex items-center gap-1">
            {format(maxDate, 'd MMMM yyyy', { locale: sv })}
            <Calendar className="h-3 w-3" />
          </span>
        </div>

        {/* Gantt bars */}
        <div className="space-y-3">
          {steps.map(step => {
            const position = getBarPosition(step.start_date, step.end_date);
            const status = getStepStatus(step);

            return (
              <div key={step.key} className="relative">
                {/* Label */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{step.name}</span>
                    {step.is_milestone && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        <Info className="h-2.5 w-2.5 mr-0.5" />
                        Milstolpe
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(step.start_date)} – {formatDate(step.end_date)}
                  </span>
                </div>

                {/* Bar container */}
                <div className="relative h-6 bg-muted/50 rounded overflow-hidden">
                  {/* The bar */}
                  <div
                    className={`absolute h-full rounded border-2 transition-all ${statusColors[status]} ${
                      step.is_milestone ? 'opacity-60' : ''
                    }`}
                    style={position}
                  />

                  {/* Today marker */}
                  {todayPosition !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10"
                      style={{ left: `${todayPosition}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-muted border border-muted-foreground/30" />
            <span>Kommande</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary border-2 border-primary" />
            <span>Pågående</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500 border-2 border-green-600" />
            <span>Slutförd</span>
          </div>
          {todayPosition !== null && (
            <div className="flex items-center gap-1.5">
              <div className="w-0.5 h-3 bg-destructive" />
              <span>Idag</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
