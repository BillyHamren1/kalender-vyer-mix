import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Activity, Bell, Lightbulb, Loader2, MessageSquare,
} from 'lucide-react';
import { useStaffDayReality } from '@/hooks/useStaffDayReality';
import { useDayWorkdayFlags } from '@/hooks/useDayWorkdayFlags';
import {
  buildDayEventLog,
  type DayInterpretation, type DaySuggestion, type NotificationEntry,
} from '@/lib/staff/dayEventLog';
import { NotificationDetailDialog } from './NotificationDetailDialog';

interface Props {
  staffId: string;
  date: string;
}

const SEV_TEXT: Record<string, string> = {
  info: 'text-foreground',
  success: 'text-foreground',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-destructive',
};
const SEV_DOT: Record<string, string> = {
  info: 'bg-muted-foreground/40',
  success: 'bg-muted-foreground/40',
  warning: 'bg-amber-500',
  critical: 'bg-destructive',
};

const ANSWER_SOURCE_LABEL: Record<string, string> = {
  staff: 'Personal',
  admin: 'Admin',
  auto: 'System (auto)',
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return format(new Date(iso), 'd MMM HH:mm', { locale: sv }); } catch { return '—'; }
};

export const StaffDayAnalysisPanel: React.FC<Props> = ({ staffId, date }) => {
  const { data: reality, isLoading: realityLoading } = useStaffDayReality(staffId, date);
  const { data: rawFlags = [], isLoading: flagsLoading } = useDayWorkdayFlags(staffId, date);
  const [selected, setSelected] = useState<NotificationEntry | null>(null);

  const log = useMemo(() => buildDayEventLog(reality, rawFlags), [reality, rawFlags]);
  const isLoading = realityLoading || flagsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground p-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Bygger analys…
      </div>
    );
  }
  if (!reality) {
    return <div className="p-3 text-[11px] text-muted-foreground">Ingen data.</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x md:divide-border/40 h-full">
        <Column icon={Activity} title="Tolkning" count={log.interpretations.length}>
          <InterpretationList items={log.interpretations} />
        </Column>
        <Column icon={Lightbulb} title="Åtgärdsförslag" count={log.suggestions.length}>
          <SuggestionList items={log.suggestions} />
        </Column>
        <Column icon={Bell} title="Notiser & svar" count={log.notifications.length}>
          <NotificationList items={log.notifications} onSelect={setSelected} />
        </Column>
      </div>
      <NotificationDetailDialog
        notification={selected}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </>
  );
};

const Column: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  children: React.ReactNode;
}> = ({ icon: Icon, title, count, children }) => (
  <div className="flex flex-col min-h-0 px-3 py-2">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
      <Icon className="h-3 w-3" />
      <span>{title}</span>
      {count != null && <span className="ml-auto tabular-nums text-muted-foreground/60">{count}</span>}
    </div>
    <div className="overflow-y-auto pr-1 -mr-1 flex-1">
      {children}
    </div>
  </div>
);

const InterpretationList: React.FC<{ items: DayInterpretation[] }> = ({ items }) => {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">Inga tolkningar.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
          <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[it.severity]} shrink-0 mt-1.5`} />
          <span className={SEV_TEXT[it.severity]}>{it.text}</span>
        </li>
      ))}
    </ul>
  );
};

const SuggestionList: React.FC<{ items: DaySuggestion[] }> = ({ items }) => {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">Inga förslag.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((s, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[s.severity]} shrink-0 mt-1.5`} />
          <div className="flex-1 min-w-0">
            <div className={`text-[11px] font-medium ${SEV_TEXT[s.severity]}`}>{s.label}</div>
            <div className="text-[10px] text-muted-foreground leading-snug">{s.rationale}</div>
          </div>
        </li>
      ))}
    </ul>
  );
};

const NotificationList: React.FC<{
  items: NotificationEntry[];
  onSelect: (n: NotificationEntry) => void;
}> = ({ items, onSelect }) => {
  if (items.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Inga notiser denna dag.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => onSelect(n)}
            className="w-full text-left flex items-start gap-1.5 rounded px-1.5 py-1 hover:bg-accent/60 transition-colors"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${SEV_DOT[n.severity]} shrink-0 mt-1.5`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="tabular-nums text-[10px] text-muted-foreground">{fmtDateTime(n.at)}</span>
                <span className={`text-[11px] font-medium ${SEV_TEXT[n.severity]} truncate`}>{n.question}</span>
                {n.needsUserInput && !n.resolved && (
                  <span className="text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold">väntar svar</span>
                )}
              </div>
              {n.resolved && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                  <MessageSquare className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">
                    {n.answer || 'Bekräftad'}
                    {n.answerSource && <> · {ANSWER_SOURCE_LABEL[n.answerSource] || n.answerSource}</>}
                  </span>
                </div>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
};
