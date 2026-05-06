import { cn } from '@/lib/utils';
import { Sun, CalendarDays, FileText } from 'lucide-react';

export type TimeTabId = 'today' | 'calendar' | 'report';

interface Props {
  value: TimeTabId;
  onChange: (id: TimeTabId) => void;
}

const TABS: { id: TimeTabId; label: string; icon: typeof Sun }[] = [
  { id: 'today', label: 'Idag', icon: Sun },
  { id: 'calendar', label: 'Kalender', icon: CalendarDays },
  { id: 'report', label: 'Tidrapport', icon: FileText },
];

/**
 * MobileTimeTabs — three tabs at the top of the Time page (Idag / Kalender /
 * Tidrapport). Mobile-friendly: 44px tap targets, visible active state,
 * sticky-able by parent.
 */
export const MobileTimeTabs = ({ value, onChange }: Props) => {
  return (
    <div
      role="tablist"
      aria-label="Tidvyer"
      className="flex items-stretch gap-1 rounded-2xl bg-muted/50 p-1 border border-border/50"
    >
      {TABS.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex-1 min-w-0 h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold transition-all',
              active
                ? 'bg-card text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground active:text-foreground',
            )}
          >
            <Icon className={cn('w-4 h-4', active ? 'text-primary' : 'opacity-70')} />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default MobileTimeTabs;
