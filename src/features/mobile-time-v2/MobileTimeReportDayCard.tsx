/**
 * MobileTimeReportDayCard — kompakt rad i rapportkön.
 * Visar datum, status-pill, total tid och en öppna-knapp.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, AlertCircle, Clock, CheckCircle2, Lock } from 'lucide-react';
import type { TimeReportQueueDay, TimeReportQueueStatus } from './types';

interface Props {
  day: TimeReportQueueDay;
  highlight?: boolean;
  onOpen: () => void;
}

function statusColor(s: TimeReportQueueStatus): {
  bg: string; text: string; border: string; icon: React.ReactNode;
} {
  switch (s) {
    case 'correction_requested':
    case 'needs_user_attention':
      return {
        bg: 'bg-destructive/10',
        text: 'text-destructive',
        border: 'border-destructive/30',
        icon: <AlertCircle className="h-3 w-3" />,
      };
    case 'needs_submit':
    case 'manual_needed':
      return {
        bg: 'bg-primary/10',
        text: 'text-primary',
        border: 'border-primary/30',
        icon: <Clock className="h-3 w-3" />,
      };
    case 'submitted':
    case 'edited':
    case 'needs_control':
    case 'ai_flagged':
      return {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-border',
        icon: <Clock className="h-3 w-3" />,
      };
    case 'approved':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        icon: <CheckCircle2 className="h-3 w-3" />,
      };
    case 'payroll_approved':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        icon: <Lock className="h-3 w-3" />,
      };
    default:
      return {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-border',
        icon: null,
      };
  }
}

const MobileTimeReportDayCard: React.FC<Props> = ({ day, highlight, onOpen }) => {
  const c = statusColor(day.status);
  return (
    <button
      onClick={onOpen}
      className={`w-full text-left rounded-xl border transition flex items-center gap-3 px-3.5 py-3 hover:bg-accent/30 ${
        highlight ? 'border-primary/50 bg-primary/[0.03]' : 'border-border bg-card'
      }`}
    >
      {/* Date pill */}
      <div className="shrink-0 flex flex-col items-center justify-center w-12">
        <div className="text-[10px] uppercase font-medium text-muted-foreground tracking-wide">
          {day.weekdayLabel}
        </div>
        <div className="text-base font-semibold leading-tight">
          {day.dayLabel.split(' ')[0]}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {day.dayLabel.split(' ')[1] ?? ''}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <Badge
          variant="outline"
          className={`gap-1 px-1.5 py-0.5 text-[10px] font-medium ${c.bg} ${c.text} ${c.border}`}
        >
          {c.icon}
          {day.statusLabel}
        </Badge>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {day.totalLabel ? (
            <span className="font-medium text-foreground">{day.totalLabel}</span>
          ) : day.status === 'manual_needed' ? (
            <span>Ingen föreslagen tid</span>
          ) : day.status === 'needs_submit' ? (
            <span>Förslag finns</span>
          ) : null}
          {day.startLabel && day.endLabel && (
            <span className="text-muted-foreground">
              · {day.startLabel}–{day.endLabel}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
};

export default MobileTimeReportDayCard;
