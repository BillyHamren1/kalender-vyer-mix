import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBookingDateChangeNotices } from '@/hooks/useBookingDateChangeNotices';
import { bookingDateNoticeLink } from '@/lib/warehouse/bookingDateChangeNotices';

interface Props {
  packingId?: string;
  compact?: boolean;
}

/** Beständig, icke-blockerande lagernotis om ändrade bokningsdatum. */
const BookingDateChangeNotices: React.FC<Props> = ({ packingId, compact }) => {
  const { groups, acknowledge } = useBookingDateChangeNotices(packingId);
  if (groups.length === 0) return null;

  return (
    <section
      aria-label="Ändrade bokningsdatum"
      className={`rounded-lg border border-amber-500/40 bg-amber-500/5 ${compact ? 'p-2.5' : 'mb-6 p-4'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="h-4 w-4 text-amber-700" />
        <h3 className="text-sm font-semibold text-foreground">
          Bokningsdatum har ändrats ({groups.length})
        </h3>
        <span className="text-xs text-muted-foreground">Datumen gäller redan — kvittera när lagret sett ändringen.</span>
      </div>
      <ul className="space-y-1.5 max-h-56 overflow-y-auto">
        {groups.map((g) => {
          const href = bookingDateNoticeLink(g);
          return (
            <li key={g.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-background px-3 py-2 border border-border/50">
              <span className="text-sm font-semibold text-foreground">
                {href && !packingId ? <Link to={href} className="underline-offset-2 hover:underline">#{g.bookingNumber ?? g.bookingId}</Link> : `#${g.bookingNumber ?? g.bookingId}`}
              </span>
              {g.changes.map((c, i) => (
                <span key={i} className="text-xs text-foreground">
                  <span className="text-muted-foreground">{c.label}:</span>{' '}
                  <span className="line-through text-muted-foreground">{c.oldValue ?? '—'}</span>{' → '}
                  <span className="font-medium">{c.newValue ?? 'borttaget'}</span>
                </span>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 px-2 text-xs gap-1"
                disabled={acknowledge.isPending}
                onClick={() => acknowledge.mutate(g.ids)}
              >
                <Check className="h-3 w-3" /> Kvittera
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default BookingDateChangeNotices;
