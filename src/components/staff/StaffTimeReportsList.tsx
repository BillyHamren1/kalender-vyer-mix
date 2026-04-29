import React, { useState, useMemo } from 'react';
import { Clock, Search, ChevronLeft, ChevronRight, CalendarDays, WifiOff } from 'lucide-react';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, addDays, subDays, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { JournalTable, buildJournalRows, type JournalTableRow } from './StaffTimeReportsTable';
import type { DaySegment, LatestPing } from '@/pages/StaffTimeReports';
import type { StaffDayJournal } from '@/lib/staff/dayJournal';

interface ProjectInfo {
  booking_id: string;
  label: string;
  is_open: boolean;
  total_hours: number;
}

interface StaffWithDayReport {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  total_hours: number;
  reports_count: number;
  has_open_report: boolean;
  earliest_start: string | null;
  latest_end: string | null;
  projects: ProjectInfo[];
  segments: DaySegment[];
  journal: StaffDayJournal;
  latestPing: LatestPing | null;
}

// "Tappad signal" — phone hasn't pinged in >10 min, but a report is still open.
const STALE_PING_MS = 10 * 60 * 1000;
type LiveStatus = 'live' | 'stale' | 'closed';
const resolveLiveStatus = (
  hasOpen: boolean,
  ping: { updated_at: string | null } | null,
): LiveStatus => {
  if (!hasOpen) return 'closed';
  if (!ping?.updated_at) return 'stale';
  const age = Date.now() - new Date(ping.updated_at).getTime();
  return age > STALE_PING_MS ? 'stale' : 'live';
};

interface StaffTimeReportsListProps {
  staffList: StaffWithDayReport[];
  isLoading: boolean;
  onSelectStaff: (id: string, name: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

const formatRelativeDate = (date: Date): string => {
  if (isToday(date)) return 'Idag';
  if (isYesterday(date)) return 'Igår';
  return format(date, 'EEEE d MMMM', { locale: sv });
};

export const StaffTimeReportsList: React.FC<StaffTimeReportsListProps> = ({
  staffList,
  isLoading,
  onSelectStaff,
  selectedDate,
  onDateChange,
}) => {
  const [search, setSearch] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const filtered = useMemo(() => {
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.role && s.role.toLowerCase().includes(q))
    );
  }, [staffList, search]);

  const dateLabel = formatRelativeDate(selectedDate);
  const subLabel = format(selectedDate, "d MMMM yyyy", { locale: sv });
  const liveCount = staffList.filter(s => resolveLiveStatus(s.has_open_report, s.latestPing) === 'live').length;
  const staleCount = staffList.filter(s => resolveLiveStatus(s.has_open_report, s.latestPing) === 'stale').length;
  const totalHours = staffList.reduce((s, x) => s + x.total_hours, 0);

  return (
    <PremiumCard
      icon={Clock}
      title="Tidrapporter"
      subtitle={`${staffList.length} ${staffList.length === 1 ? 'person rapporterade' : 'personer rapporterade'} · ${subLabel}`}
      count={staffList.length}
    >
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDateChange(subDays(selectedDate, 1))}
          className="rounded-lg shrink-0 h-8 px-3 gap-1.5"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Förra
        </Button>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg flex-1 max-w-[280px] gap-2 font-medium capitalize h-8"
            >
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                if (d) {
                  onDateChange(d);
                  setCalendarOpen(false);
                }
              }}
              locale={sv}
              initialFocus
              className="pointer-events-auto"
            />
            <div className="p-2 border-t flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onDateChange(new Date());
                  setCalendarOpen(false);
                }}
                className="rounded-lg text-xs"
              >
                Idag
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          className="rounded-lg shrink-0 h-8 px-3 gap-1.5"
        >
          Nästa
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Summary — neutral, only stale gets a warning color */}
      {!isLoading && staffList.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">{formatHoursMinutes(totalHours)}</span> totalt
          </span>
          {liveCount > 0 && (
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{liveCount}</span> pågående
            </span>
          )}
          {staleCount > 0 && (
            <span className="tabular-nums text-destructive font-medium inline-flex items-center gap-1">
              <WifiOff className="h-3 w-3" />
              {staleCount} tappad signal
            </span>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök personal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {search
            ? 'Inga träffar'
            : `Ingen personal har rapporterat tid ${dateLabel.toLowerCase()}`}
        </div>
      ) : (
        <JournalTable
          rows={filtered.flatMap(s => buildJournalRows(s))}
          date={dateStr}
          onSelectStaff={onSelectStaff}
        />
      )}
    </PremiumCard>
  );
};
