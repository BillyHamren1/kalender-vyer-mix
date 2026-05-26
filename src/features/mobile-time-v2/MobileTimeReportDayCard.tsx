/**
 * MobileTimeReportDayCard — kompakt rad i rapportkön.
 *
 * Snabbåtgärder direkt på kortet:
 *   - needs_submit + rimligt förslag → primär "Skicka" (med kvittens), sekundär "Granska"
 *   - needs_submit utan rimligt förslag (varningar) → primär "Granska"
 *   - manual_needed → primär "Fyll i"
 *   - correction_requested / needs_user_attention → primär "Granska"
 *   - Skickat/klart → bara "Visa"
 *
 * Direkt-skicka utförs av föräldern (queue) via onQuickSubmit. Kortet
 * äger bara presentationen och spinner/check-feedback.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronRight, AlertCircle, Clock, CheckCircle2, Lock, Send, Eye,
  Pencil, Loader2,
} from 'lucide-react';
import type { TimeReportQueueDay, TimeReportQueueStatus } from './types';

interface Props {
  day: TimeReportQueueDay;
  highlight?: boolean;
  /** True medan vi gör direkt-skicka för just det här kortet. */
  isSubmitting?: boolean;
  /** True kort efter lyckad submit för grön check-animation. */
  isJustSubmitted?: boolean;
  /** Öppna granska-vyn (sheet). */
  onOpen: () => void;
  /** Direkt-skicka. Kortet visar bara spinner; safety-check + submit + auto-fallback äger queue. */
  onQuickSubmit?: () => void;
  /** Öppna direkt i edit-läge (för manual_needed). */
  onFill?: () => void;
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

interface ActionPlan {
  primary: { label: string; icon: React.ReactNode; onClick: () => void };
  secondary?: { label: string; icon: React.ReactNode; onClick: () => void };
}

function planActions(props: Props): ActionPlan | null {
  const { day, onOpen, onQuickSubmit, onFill } = props;
  switch (day.status) {
    case 'needs_submit': {
      if (onQuickSubmit && day.canSubmit) {
        return {
          primary: { label: 'Skicka', icon: <Send className="h-3.5 w-3.5 mr-1.5" />, onClick: onQuickSubmit },
          secondary: { label: 'Granska', icon: <Eye className="h-3.5 w-3.5 mr-1.5" />, onClick: onOpen },
        };
      }
      return { primary: { label: 'Granska', icon: <Eye className="h-3.5 w-3.5 mr-1.5" />, onClick: onOpen } };
    }
    case 'manual_needed':
      return {
        primary: {
          label: 'Fyll i',
          icon: <Pencil className="h-3.5 w-3.5 mr-1.5" />,
          onClick: onFill ?? onOpen,
        },
      };
    case 'correction_requested':
    case 'needs_user_attention':
      return {
        primary: { label: 'Granska', icon: <Eye className="h-3.5 w-3.5 mr-1.5" />, onClick: onOpen },
      };
    case 'submitted':
    case 'edited':
    case 'needs_control':
    case 'ai_flagged':
    case 'approved':
    case 'payroll_approved':
    case 'rejected':
    case 'withdrawn':
    default:
      return null;
  }
}

const MobileTimeReportDayCard: React.FC<Props> = (props) => {
  const { day, highlight, isSubmitting, isJustSubmitted, onOpen } = props;
  const c = statusColor(day.status);
  const actions = !isJustSubmitted ? planActions(props) : null;

  return (
    <div
      className={`group w-full rounded-2xl border transition-all px-3 py-3 ${
        isJustSubmitted
          ? 'border-emerald-300 bg-emerald-50/70 shadow-[0_1px_2px_hsl(160_40%_30%/0.10)]'
          : highlight
          ? 'border-primary/30 bg-primary-soft shadow-[0_1px_2px_hsl(184_30%_15%/0.05)]'
          : 'border-border/60 bg-card shadow-[0_1px_2px_hsl(184_30%_15%/0.04)]'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Date block */}
        <button
          type="button"
          onClick={onOpen}
          disabled={isSubmitting}
          className={`shrink-0 flex flex-col items-center justify-center w-12 h-14 rounded-xl border ${
            isJustSubmitted
              ? 'bg-card/80 border-emerald-200'
              : highlight
              ? 'bg-card/80 border-primary/20'
              : 'bg-muted/40 border-border/50'
          }`}
          aria-label="Öppna dagen"
        >
          <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest leading-none">
            {day.weekdayLabel}
          </div>
          <div className={`text-[20px] font-extrabold leading-none tabular-nums mt-1 ${
            isJustSubmitted ? 'text-emerald-700' : highlight ? 'text-primary' : 'text-foreground'
          }`}>
            {day.dayLabel.split(' ')[0]}
          </div>
          <div className="text-[9px] text-muted-foreground/80 leading-none mt-0.5">
            {day.dayLabel.split(' ')[1] ?? ''}
          </div>
        </button>

        {/* Body */}
        <button
          type="button"
          onClick={onOpen}
          disabled={isSubmitting}
          className="flex-1 min-w-0 text-left"
        >
          {isJustSubmitted ? (
            <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-800 border-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              Inskickad
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={`gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full ${c.bg} ${c.text} ${c.border}`}
            >
              {c.icon}
              {day.statusLabel}
            </Badge>
          )}
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
        </button>

        {!actions && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        )}
      </div>

      {/* Action-row */}
      {actions && (
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 px-3 text-xs font-semibold flex-1 min-w-0"
            onClick={actions.primary.onClick}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Skickar…</>
            ) : (
              <>{actions.primary.icon}{actions.primary.label}</>
            )}
          </Button>
          {actions.secondary && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={actions.secondary.onClick}
              disabled={isSubmitting}
            >
              {actions.secondary.icon}
              {actions.secondary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileTimeReportDayCard;
