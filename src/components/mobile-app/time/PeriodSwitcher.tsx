import { cn } from '@/lib/utils';

export type PeriodKind = 'day' | 'week' | 'month';

interface Props {
  value: PeriodKind;
  onChange: (v: PeriodKind) => void;
}

const ITEMS: { id: PeriodKind; label: string }[] = [
  { id: 'day', label: 'Dag' },
  { id: 'week', label: 'Vecka' },
  { id: 'month', label: 'Månad' },
];

/**
 * PeriodSwitcher — Day/Week/Month segmented control for TimeReportTab.
 * Visual sibling of MobileTimeTabs but smaller, used to switch period kind.
 */
export const PeriodSwitcher = ({ value, onChange }: Props) => {
  return (
    <div
      role="tablist"
      aria-label="Period"
      className="flex items-stretch gap-1 rounded-xl bg-muted/40 p-1 border border-border/50"
    >
      {ITEMS.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cn(
              'flex-1 h-9 rounded-lg text-xs font-bold transition-all',
              active
                ? 'bg-card text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground active:text-foreground',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
};

export default PeriodSwitcher;
