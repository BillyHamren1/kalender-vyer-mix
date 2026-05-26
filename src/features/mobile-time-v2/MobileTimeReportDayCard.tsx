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
      className={`group w-full text-left rounded-2xl border transition-all flex items-center gap-3 px-3 py-3 active:scale-[0.99] ${
        highlight
          ? 'border-primary/30 bg-primary-soft shadow-[0_1px_2px_hsl(184_30%_15%/0.05)]'
          : 'border-border/60 bg-card shadow-[0_1px_2px_hsl(184_30%_15%/0.04)] hover:bg-muted/30'
      }`}
    >
      {/* Date block */}
      <div className={`shrink-0 flex flex-col items-center justify-center w-12 h-14 rounded-xl border ${
        highlight ? 'bg-card/80 border-primary/20' : 'bg-muted/40 border-border/50'
      }`}>
        <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest leading-none">
          {day.weekdayLabel}
        </div>
        <div className={`text-[20px] font-extrabold leading-none tabular-nums mt-1 ${highlight ? 'text-primary' : 'text-foreground'}`}>
          {day.dayLabel.split(' ')[0]}
        </div>
        <div className="text-[9px] text-muted-foreground/80 leading-none mt-0.5">
          {day.dayLabel.split(' ')[1] ?? ''}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <Badge
          variant="outline"
          className={`gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full ${c.bg} ${c.text} ${c.border}`}
        >
          {c.icon}
          {day.statusLabel}
        </Badge>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {day.totalLabel ? (
            <span className="font-semibold text-foreground tabular-nums">{day.totalLabel}</span>
          ) : day.status === 'manual_needed' ? (
            <span className="text-muted-foreground">Ingen föreslagen tid</span>
          ) : day.status === 'needs_submit' ? (
            <span className="text-muted-foreground">Förslag finns</span>
          ) : null}
          {day.startLabel && day.endLabel && (
            <span className="text-muted-foreground/70 tabular-nums">
              · {day.startLabel}–{day.endLabel}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 group-active:translate-x-0.5 transition-transform" />
    </button>
  );
};


export default MobileTimeReportDayCard;
