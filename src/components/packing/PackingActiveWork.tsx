import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { PackingWithBooking, PACKING_STATUS_LABELS, PACKING_STATUS_COLORS } from '@/types/packing';
import { usePackingProgressBatch } from '@/hooks/usePackingProgress';

const ACTIVE_STATUSES = ['in_progress', 'returning'] as const;
const INITIAL = 8;

interface Props {
  packings: PackingWithBooking[];
}

/**
 * Pågående arbete visas bara när det faktiskt finns något att fortsätta med.
 * Ingen tom statusyta och ingen räknare för räknarens skull.
 */
const PackingActiveWork: React.FC<Props> = ({ packings }) => {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const active = useMemo(
    () =>
      packings
        .filter(p => (ACTIVE_STATUSES as readonly string[]).includes(p.status))
        .sort((a, b) => {
          const da = a.booking?.rigdaydate ? new Date(a.booking.rigdaydate).getTime() : Infinity;
          const db = b.booking?.rigdaydate ? new Date(b.booking.rigdaydate).getTime() : Infinity;
          return da - db;
        }),
    [packings]
  );

  const visible = showAll ? active : active.slice(0, INITIAL);
  const bookingIds = visible.map(p => p.booking_id).filter((x): x is string => !!x);
  const { progressMap } = usePackingProgressBatch(bookingIds);

  if (active.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-border/40 bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3">
        <Activity className="h-4 w-4 text-warehouse" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Pågående arbete</h2>
      </div>

      <div className="divide-y divide-border/20">
        {visible.map(p => {
          const prog = p.booking_id ? progressMap.get(p.booking_id) : undefined;
          const eventDate = p.booking?.eventdate || p.end_date;
          return (
            <div
              key={p.id}
              className="flex cursor-pointer items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/30"
              onClick={() => navigate(`/warehouse/packing/${p.id}`)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-[hsl(var(--heading))]">
                    {p.booking?.client || p.name}
                  </span>
                  {p.booking?.booking_number && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                      #{p.booking.booking_number}
                    </span>
                  )}
                  <Badge className={`${PACKING_STATUS_COLORS[p.status]} shrink-0 px-1.5 py-0 text-[10px]`}>
                    {PACKING_STATUS_LABELS[p.status]}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {prog && prog.totalItems > 0 && (
                    <span>{prog.scannedItems} / {prog.totalItems} packade</span>
                  )}
                  {eventDate && (
                    <span>Event {format(new Date(eventDate), 'd MMM', { locale: sv })}</span>
                  )}
                  {p.project_leader && <span className="truncate">{p.project_leader}</span>}
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-7 shrink-0 px-3 text-xs">
                Fortsätt
              </Button>
            </div>
          );
        })}
        {active.length > visible.length && (
          <button
            className="w-full px-5 py-2.5 text-left text-xs font-medium text-primary hover:underline"
            onClick={() => setShowAll(true)}
          >
            Visa fler pågående →
          </button>
        )}
      </div>
    </section>
  );
};

export default PackingActiveWork;
