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
 * "Pågående arbete" i Lager OPS.
 * Renderas endast när något faktiskt är aktivt — inga tomma statusblock,
 * inga räknare utan innebörd. Varje rad öppnas via "Fortsätt".
 */
const OpsActiveWork: React.FC<Props> = ({ packings }) => {
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
    <section className="rounded-2xl border border-border/40 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
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
              className="px-5 py-3 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => navigate(`/warehouse/packing/${p.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate text-[hsl(var(--heading))]">
                    {p.booking?.client || p.name}
                  </span>
                  {p.booking?.booking_number && (
                    <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">
                      #{p.booking.booking_number}
                    </span>
                  )}
                  <Badge className={`${PACKING_STATUS_COLORS[p.status]} text-[10px] px-1.5 py-0 shrink-0`}>
                    {PACKING_STATUS_LABELS[p.status]}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {prog && prog.totalItems > 0 && (
                    <span>{prog.scannedItems} / {prog.totalItems} packade</span>
                  )}
                  {eventDate && (
                    <span>Event {format(new Date(eventDate), 'd MMM', { locale: sv })}</span>
                  )}
                  {p.project_leader && <span className="truncate">{p.project_leader}</span>}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-3 text-xs shrink-0">
                Fortsätt →
              </Button>
            </div>
          );
        })}
        {active.length > visible.length && (
          <button
            className="w-full text-left px-5 py-2.5 text-xs font-medium text-primary hover:underline"
            onClick={() => setShowAll(true)}
          >
            Visa alla pågående ({active.length}) →
          </button>
        )}
      </div>
    </section>
  );
};

export default OpsActiveWork;
