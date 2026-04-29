import React, { useState, useMemo } from 'react';
import { Clock, ChevronRight, Search, ChevronLeft, CalendarDays, WifiOff } from 'lucide-react';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, addDays, subDays, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { PingPhoneButton } from './PingPhoneButton';
import { DayHeaderRow, ProjectSessionRow } from './DayJournalRow';
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
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

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

  const toggleExpanded = (id: string) => {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {search
                ? 'Inga träffar'
                : `Ingen personal har rapporterat tid ${dateLabel.toLowerCase()}`}
            </div>
          ) : (
            filtered.map(staff => {
              const liveStatus = resolveLiveStatus(staff.has_open_report, staff.latestPing);
              const pingAgeMin = staff.latestPing?.updated_at
                ? Math.floor((Date.now() - new Date(staff.latestPing.updated_at).getTime()) / 60000)
                : null;
              const expanded = expandedStaff.has(staff.id);

              return (
                <div
                  key={staff.id}
                  className="rounded-lg border border-border/40 hover:border-border transition-colors"
                >
                  {/* Compact header — click to toggle journal */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(staff.id)}
                    className="w-full flex items-stretch gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 relative self-start mt-0.5 bg-muted text-muted-foreground">
                      {staff.name.charAt(0).toUpperCase()}
                      {liveStatus === 'live' && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-foreground border-2 border-background" />
                      )}
                      {liveStatus === 'stale' && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive border-2 border-background" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-medium text-sm text-foreground truncate">{staff.name}</span>
                          {staff.role && (
                            <span className="text-[11px] text-muted-foreground">{staff.role}</span>
                          )}
                          {liveStatus === 'live' && (
                            <span className="text-[11px] text-muted-foreground">· Pågående</span>
                          )}
                          {liveStatus === 'closed' && (
                            <span className="text-[11px] text-muted-foreground">· Avslutad</span>
                          )}
                          {liveStatus === 'stale' && (
                            <span
                              className="text-[11px] font-medium text-destructive inline-flex items-center gap-1"
                              title={pingAgeMin != null ? `Senaste signal för ${pingAgeMin} min sedan` : 'Ingen signal från telefonen'}
                            >
                              <WifiOff className="h-3 w-3" />
                              Tappad signal{pingAgeMin != null ? ` · ${pingAgeMin}m` : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-foreground tabular-nums leading-tight">
                            {formatHoursMinutes(staff.total_hours)}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums leading-tight">
                            {staff.earliest_start && (
                              <>
                                {staff.earliest_start.slice(0, 5)}
                                {' – '}
                                {staff.has_open_report
                                  ? <span className="text-foreground font-medium">pågår</span>
                                  : (staff.latest_end?.slice(0, 5) || '—')}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Expanded journal */}
                  {expanded && (
                    <div className="px-3 pb-3 pt-1 space-y-1 bg-muted/10 border-t border-border/40">
                      <DayHeaderRow
                        variant="start"
                        header={staff.journal.start}
                        staffId={staff.id}
                        date={dateStr}
                      />

                      {staff.journal.sessions.length === 0 ? (
                        <div className="ml-3 py-3 text-xs text-muted-foreground italic">
                          Inga projekt-sessioner — bara närvaro vid {staff.journal.start.address || 'en plats'}.
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {staff.journal.sessions.map(s => (
                            <ProjectSessionRow
                              key={s.key}
                              session={s}
                              staffId={staff.id}
                              staffName={staff.name}
                              date={dateStr}
                            />
                          ))}
                        </div>
                      )}

                      <DayHeaderRow
                        variant="end"
                        header={staff.journal.end}
                        totalHours={staff.total_hours}
                        staffId={staff.id}
                        date={dateStr}
                      />

                      <div className="flex items-center justify-between pt-2 border-t border-border/40">
                        {liveStatus === 'stale' && (
                          <PingPhoneButton staffId={staff.id} staffName={staff.name} />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 text-xs gap-1"
                          onClick={() => onSelectStaff(staff.id, staff.name)}
                        >
                          Detaljerad rapport
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </PremiumCard>
  );
};
