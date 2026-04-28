import React from 'react';
import { Card } from '@/components/ui/card';
import { ClipboardList, PlayCircle, AlertTriangle, CheckCircle2, ShieldCheck, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SummaryCounts {
  total: number;
  ongoing: number;
  needsReview: number;
  readyToApprove: number;
  approved: number;
}

interface CardSpec {
  key: keyof SummaryCounts;
  label: string;
  icon: LucideIcon;
  tone: string;
  iconTone: string;
}

const CARDS: CardSpec[] = [
  { key: 'total',          label: 'Totalt att granska',  icon: ClipboardList, tone: 'from-slate-500/10 to-slate-500/0',     iconTone: 'bg-slate-500/15 text-slate-700' },
  { key: 'ongoing',        label: 'Pågående dagar',      icon: PlayCircle,    tone: 'from-teal-500/15 to-teal-500/0',       iconTone: 'bg-teal-500/15 text-teal-700' },
  { key: 'needsReview',    label: 'Behöver review',      icon: AlertTriangle, tone: 'from-amber-500/15 to-amber-500/0',     iconTone: 'bg-amber-500/15 text-amber-700' },
  { key: 'readyToApprove', label: 'Redo att godkänna',   icon: CheckCircle2,  tone: 'from-emerald-500/15 to-emerald-500/0', iconTone: 'bg-emerald-500/15 text-emerald-700' },
  { key: 'approved',       label: 'Godkända',            icon: ShieldCheck,   tone: 'from-primary/15 to-primary/0',         iconTone: 'bg-primary/15 text-primary' },
];

export interface SummaryCardsProps {
  counts: SummaryCounts;
  activeFilter?: keyof SummaryCounts | null;
  onFilterChange?: (next: keyof SummaryCounts | null) => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ counts, activeFilter, onFilterChange }) => (
  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
    {CARDS.map((c) => {
      const Icon = c.icon;
      const isActive = activeFilter === c.key;
      const clickable = !!onFilterChange;
      return (
        <Card
          key={c.key}
          onClick={clickable ? () => onFilterChange!(isActive ? null : c.key) : undefined}
          className={cn(
            'relative overflow-hidden p-4 border transition-all bg-gradient-to-br',
            c.tone,
            clickable && 'cursor-pointer hover:shadow-md active:scale-[0.99]',
            isActive && 'ring-2 ring-primary border-primary/40 shadow-md',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {c.label}
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums leading-none text-foreground">
                {counts[c.key]}
              </p>
            </div>
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', c.iconTone)}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </Card>
      );
    })}
  </div>
);

export default SummaryCards;
