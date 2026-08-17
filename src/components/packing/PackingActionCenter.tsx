import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, differenceInDays, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';
import { PackingWithBooking } from '@/types/packing';
import PackingChangedList, { useChangedPackings } from './PackingChangedList';

type CategoryKey = 'changed' | 'urgent' | 'overdue';

interface Props {
  packings: PackingWithBooking[];
}

const PREVIEW = 5;

/**
 * "Kräver åtgärd" — operativ startpunkt på /warehouse/packing.
 * Visar endast befintliga packningar som behöver åtgärd.
 * Nya Planning-projekt hanteras enbart via /warehouse/calendar → Att planera.
 */
const PackingActionCenter: React.FC<Props> = ({ packings }) => {
  const navigate = useNavigate();
  const [active, setActive] = useState<CategoryKey>('changed');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: changed = [] } = useChangedPackings();

  const { urgent, overdue } = useMemo(() => {
    const urgentList = packings
      .filter(p => {
        if (p.status === 'completed') return false;
        if (!p.booking?.rigdaydate) return false;
        const days = differenceInDays(new Date(p.booking.rigdaydate), new Date());
        return days >= 0 && days <= 7;
      })
      .sort((a, b) => new Date(a.booking!.rigdaydate!).getTime() - new Date(b.booking!.rigdaydate!).getTime());

    const overdueList = packings
      .filter(p => {
        if (p.status === 'completed' || p.status === 'delivered') return false;
        if (!p.booking?.rigdaydate) return false;
        return isPast(new Date(p.booking.rigdaydate));
      })
      .sort((a, b) => new Date(b.booking!.rigdaydate!).getTime() - new Date(a.booking!.rigdaydate!).getTime());

    return { urgent: urgentList, overdue: overdueList };
  }, [packings]);

  const categories: Array<{ key: CategoryKey; label: string; count: number; icon: React.ElementType; tone: string }> = [
    { key: 'changed', label: 'Ändrade', count: changed.length, icon: RefreshCw, tone: 'text-amber-600' },
    { key: 'urgent', label: 'Brådskande', count: urgent.length, icon: Clock, tone: 'text-warehouse' },
    { key: 'overdue', label: 'Försenade', count: overdue.length, icon: AlertTriangle, tone: 'text-destructive' },
  ];

  const totalActions = categories.reduce((sum, c) => sum + c.count, 0);

  const limitFor = (key: CategoryKey, total: number) => (expanded[key] ? total : key === 'overdue' ? 3 : PREVIEW);

  const showAllRow = (key: CategoryKey, total: number, shown: number) =>
    total > shown ? (
      <button
        className="w-full text-left py-2 text-xs font-medium text-primary hover:underline"
        onClick={() => setExpanded(e => ({ ...e, [key]: true }))}
      >
        Visa alla {total} →
      </button>
    ) : null;

  const renderPackingList = (key: CategoryKey, list: PackingWithBooking[], subtitle: (p: PackingWithBooking) => string) => {
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground py-3">Inget att visa.</p>;
    }
    const visible = list.slice(0, limitFor(key, list.length));
    return (
      <div className="divide-y divide-border/30">
        {visible.map(p => (
          <div key={p.id} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{p.booking?.client || p.name}</span>
                {p.booking?.booking_number && (
                  <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">#{p.booking.booking_number}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{subtitle(p)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs shrink-0"
              onClick={() => navigate(`/warehouse/packing/${p.id}`)}
            >
              Öppna
            </Button>
          </div>
        ))}
        {showAllRow(key, list.length, visible.length)}
      </div>
    );
  };

  return (
    <section className="mb-6 rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warehouse" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kräver åtgärd</h2>
        <span className="text-xs text-muted-foreground">{totalActions} poster</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3">
        {categories.map(c => {
          const isActive = active === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                isActive ? 'border-primary/50 bg-primary/5' : 'border-border/40 hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <c.icon className={`h-3.5 w-3.5 ${c.tone}`} />
                <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
              </div>
              <p className="text-xl font-bold text-[hsl(var(--heading))]">{c.count}</p>
            </button>
          );
        })}
      </div>

      <div className="px-5 pb-3">
        {active === 'changed' && (
          <PackingChangedList
            limit={limitFor('changed', changed.length)}
            onShowAll={() => setExpanded(e => ({ ...e, changed: true }))}
          />
        )}
        {active === 'urgent' && renderPackingList('urgent', urgent, p => {
          const days = differenceInDays(new Date(p.booking!.rigdaydate!), new Date());
          return `Packning ej klar · rigg om ${days} ${days === 1 ? 'dag' : 'dagar'}`;
        })}
        {active === 'overdue' && renderPackingList('overdue', overdue, p => {
          const days = Math.abs(differenceInDays(new Date(p.booking!.rigdaydate!), new Date()));
          return `${days} dagar försenad · rigg ${format(new Date(p.booking!.rigdaydate!), 'd MMM yyyy', { locale: sv })}`;
        })}
      </div>
    </section>
  );
};

export default PackingActionCenter;
