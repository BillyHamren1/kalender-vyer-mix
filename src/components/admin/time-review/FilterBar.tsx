import React from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AnomalyKind } from '@/lib/admin/adminTimeReviewEngine';

export interface FilterState {
  from: Date;
  to: Date;
  staffId: string | 'all';
  status: 'all' | 'ongoing' | 'needsReview' | 'readyToApprove' | 'approved';
  anomaly: AnomalyKind | 'all';
  projectQuery: string;
}

const ANOMALY_LABELS: Record<AnomalyKind | 'all', string> = {
  all: 'Alla avvikelser',
  stayed_after_planned_end: 'Kvar efter planerat',
  late_start: 'Sen start',
  over_planned_time: 'Över planerad tid',
  unallocated_time: 'Oallokerad tid',
  needs_review: 'Behöver review',
  open_timer_stale: 'Öppen timer',
  overlap: 'Överlapp',
  missing_logout: 'Saknad utloggning',
};

export interface FilterBarProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  staffOptions: Array<{ id: string; name: string }>;
  onReset: () => void;
}

const DateButton: React.FC<{ date: Date; onChange: (d: Date) => void; label: string }> = ({ date, onChange, label }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="h-9 gap-2 font-medium">
        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span>{format(date, 'd MMM', { locale: sv })}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar
        mode="single"
        selected={date}
        onSelect={(d) => d && onChange(d)}
        initialFocus
        className={cn('p-3 pointer-events-auto')}
      />
    </PopoverContent>
  </Popover>
);

export const FilterBar: React.FC<FilterBarProps> = ({ value, onChange, staffOptions, onReset }) => {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v });
  const isFiltered =
    value.staffId !== 'all' ||
    value.status !== 'all' ||
    value.anomaly !== 'all' ||
    value.projectQuery.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card/40 backdrop-blur-sm">
      <DateButton date={value.from} onChange={(d) => set('from', d)} label="Från" />
      <span className="text-muted-foreground text-sm">→</span>
      <DateButton date={value.to} onChange={(d) => set('to', d)} label="Till" />

      <div className="h-6 w-px bg-border mx-1" />

      <Select value={value.staffId} onValueChange={(v) => set('staffId', v as any)}>
        <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Personal" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla personal</SelectItem>
          {staffOptions.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.status} onValueChange={(v) => set('status', v as any)}>
        <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla status</SelectItem>
          <SelectItem value="ongoing">Pågående</SelectItem>
          <SelectItem value="needsReview">Behöver review</SelectItem>
          <SelectItem value="readyToApprove">Redo att godkänna</SelectItem>
          <SelectItem value="approved">Godkända</SelectItem>
        </SelectContent>
      </Select>

      <Select value={value.anomaly} onValueChange={(v) => set('anomaly', v as any)}>
        <SelectTrigger className="h-9 w-[210px]"><SelectValue placeholder="Avvikelse" /></SelectTrigger>
        <SelectContent>
          {(Object.keys(ANOMALY_LABELS) as Array<keyof typeof ANOMALY_LABELS>).map((k) => (
            <SelectItem key={k} value={k}>{ANOMALY_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={value.projectQuery}
        onChange={(e) => set('projectQuery', e.target.value)}
        placeholder="Sök projekt eller person…"
        className="h-9 w-[220px]"
      />

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9 gap-1 text-muted-foreground">
          <X className="w-3.5 h-3.5" /> Rensa
          <Badge variant="secondary" className="ml-1 text-[10px]">filter</Badge>
        </Button>
      )}
    </div>
  );
};

export default FilterBar;
