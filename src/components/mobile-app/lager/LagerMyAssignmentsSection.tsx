import { useEffect, useState } from 'react';
import { Loader2, MapPin, Package } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  event_type: string;
  booking_id: string | null;
  booking_number: string | null;
  delivery_address: string | null;
  completed?: boolean;
  status?: string;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  internal_task: 'Intern lageruppgift',
  packing: 'Packning',
  return: 'Retur',
  inventory: 'Inventering',
  warehouse: 'Lager',
};

const formatTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('sv-SE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const LagerMyAssignmentsSection = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Assignment[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await mobileApi.getLagerAssignments();
        if (!cancelled) setItems(res.assignments || []);
      } catch (e) {
        console.error('[LagerMyAssignments] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Package className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Mina lageruppgifter
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Inga lageruppgifter tilldelade just nu.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-border bg-card p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground text-[15px] leading-snug truncate">
                    {a.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {EVENT_TYPE_LABEL[a.event_type] || a.event_type}
                    {a.booking_number ? ` · ${a.booking_number}` : ''}
                  </p>
                </div>
                {a.status === 'completed' && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Klar
                  </span>
                )}
              </div>

              {a.description && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                  {a.description}
                </p>
              )}

              {(a.start_time || a.end_time) && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  ⏱ {formatTime(a.start_time)}
                  {a.end_time && a.end_time !== a.start_time
                    ? ` – ${formatTime(a.end_time)}`
                    : ''}
                </p>
              )}

              {a.delivery_address && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{a.delivery_address}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LagerMyAssignmentsSection;
