import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GanttChart, Edit, Calendar, Info, Package } from 'lucide-react';
import { format, differenceInDays, isBefore, isAfter } from 'date-fns';
import { sv } from 'date-fns/locale';

export interface GanttStep {
  id?: string;
  key: string;
  name: string;
  /** Extra rad under titeln, t.ex. produkter kopplade till aktiviteten */
  subtitle?: string | null;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  is_milestone: boolean;
  sort_order?: number;
}

interface LargeProjectGanttChartProps {
  steps: GanttStep[];
  onEdit?: () => void;
}

const PALETTE_SIZE = 8;

const colorIndex = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100000;
  }
  return (hash % PALETTE_SIZE) + 1;
};

const toMs = (dateStr: string, timeStr?: string | null, fallbackTime = '00:00') => {
  const time = (timeStr || fallbackTime).slice(0, 5);
  const parsed = new Date(`${dateStr}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(dateStr).getTime() : parsed.getTime();
};

export const LargeProjectGanttChart: React.FC<LargeProjectGanttChartProps> = ({
  steps,
  onEdit
}) => {
  if (steps.length === 0) {
    return null;
  }

  const ranges = steps.map((step) => {
    const start = toMs(step.start_date, step.start_time, '00:00');
    let end = toMs(step.end_date, step.end_time, step.end_time ? '00:00' : '23:59');
    if (end <= start) end = start + 60 * 60 * 1000;
    return { step, start, end };
  });

  const minMs = Math.min(...ranges.map((r) => r.start));
  const maxMs = Math.max(...ranges.map((r) => r.end));
  const span = Math.max(maxMs - minMs, 60 * 60 * 1000);
  const minDate = new Date(minMs);
  const maxDate = new Date(maxMs);
  const today = new Date();
  const isSingleDay = differenceInDays(maxDate, minDate) === 0;

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'd MMM', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  const getStepStatus = (start: number, end: number) => {
    if (isBefore(today, new Date(start))) return 'upcoming';
    if (isAfter(today, new Date(end))) return 'completed';
    return 'active';
  };

  const todayPosition = today.getTime() >= minMs && today.getTime() <= maxMs
    ? ((today.getTime() - minMs) / span) * 100
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
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-1">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(minDate, isSingleDay ? "d MMMM yyyy 'kl.' HH:mm" : 'd MMMM yyyy', { locale: sv })}
          </span>
          <span className="flex items-center gap-1">
            {format(maxDate, isSingleDay ? "'kl.' HH:mm" : 'd MMMM yyyy', { locale: sv })}
            <Calendar className="h-3 w-3" />
          </span>
        </div>

        <div className="space-y-3">
          {ranges.map(({ step, start, end }) => {
            const status = getStepStatus(start, end);
            const left = ((start - minMs) / span) * 100;
            const width = Math.max(((end - start) / span) * 100, 2);
            const idx = colorIndex(step.id || step.key || step.name);
            const barColor = `hsl(var(--gantt-${idx}))`;

            const timeLabel = step.start_time || step.end_time
              ? `${step.start_time?.slice(0, 5) || ''}–${step.end_time?.slice(0, 5) || ''}`
              : null;

            return (
              <div key={step.key} className="relative">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: barColor }}
                        aria-hidden
                      />
                      <span className="text-sm font-medium">{step.name}</span>
                      {timeLabel && (
                        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{timeLabel}</span>
                      )}
                      {step.is_milestone && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                          <Info className="h-2.5 w-2.5 mr-0.5" />
                          Milstolpe
                        </Badge>
                      )}
                    </div>
                    {step.subtitle && (
                      <span className="mt-0.5 flex items-start gap-1 pl-[18px] text-xs text-foreground/80">
                        <Package className="mt-[2px] h-3 w-3 shrink-0 text-primary" />
                        <span className="break-words">{step.subtitle}</span>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {isSingleDay
                      ? formatDate(step.start_date)
                      : `${formatDate(step.start_date)} – ${formatDate(step.end_date)}`}
                  </span>
                </div>

                <div className="relative h-6 rounded bg-muted/50 overflow-hidden">
                  <div
                    className="absolute h-full rounded transition-all"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: barColor,
                      opacity: status === 'completed' ? 0.45 : step.is_milestone ? 0.7 : 1,
                    }}
                    title={`${step.name}${timeLabel ? ` ${timeLabel}` : ''}`}
                  />

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

        <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
          <span>Varje aktivitet har egen färg. Blekare stapel = avslutad.</span>
          {todayPosition !== null && (
            <div className="flex items-center gap-1.5">
              <div className="w-0.5 h-3 bg-destructive" />
              <span>Nu</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
