/**
 * MobileLagerPage — internal "Lager" hub for the Time-app.
 *
 * Shown when the user taps the Lager card on /m/jobs. Lists the day's
 * concrete warehouse_assignments (packing / return / inventory / internal
 * task) with type-badge, time, customer/booking/delivery info and a
 * primary CTA driven by the assignment's `action`.
 */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, Package } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useLagerAssignments, type LagerAssignmentItem } from '@/hooks/useLagerAssignments';
import {
  ASSIGNMENT_ACTION_LABEL,
  ASSIGNMENT_TYPE_LABEL,
  ASSIGNMENT_TYPE_TONE,
  dayTimeWindow,
  resolveAction,
  resolveAssignmentType,
  resolveTitle,
  summarizeTypes,
} from '@/lib/warehouse/lagerLabels';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';
import { getWarehouseDisplayName } from '@/lib/warehouse/warehouseTeam';

const formatHHMM = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};

const MobileLagerPage = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const dateParam = search.get('date') ?? format(new Date(), 'yyyy-MM-dd');
  const { assignments, loading, refresh } = useLagerAssignments({ date: dateParam });

  const window = dayTimeWindow(assignments);
  const summary = summarizeTypes(assignments);

  const handleAction = async (item: LagerAssignmentItem) => {
    const action = resolveAction(item);
    switch (action) {
      case 'open_scanner':
      case 'open_return_scanner':
        navigate('/m/tools/scanner');
        return;
      case 'open_inventory':
        navigate('/m/tools/scanner');
        return;
      case 'complete_task':
        if (item.project_task_id) {
          try {
            await mobileApi.completeLagerTask?.({ task_id: item.project_task_id });
            toast.success('Markerad som klar');
            refresh();
          } catch (e) {
            console.warn('[MobileLagerPage] complete_task failed', e);
            toast.error('Kunde inte markera som klar');
          }
        } else {
          toast.message('Markera klar är inte tillgängligt här ännu.');
        }
        return;
      case 'open_details':
      default:
        if (item.booking_id) navigate(`/m/job/${item.booking_id}`);
        return;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <div className="bg-primary text-primary-foreground px-4 pt-3 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-primary-foreground/80 active:opacity-70"
          aria-label="Tillbaka"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs">Tillbaka</span>
        </button>
        <div className="mt-2 flex items-center gap-2">
          <Package className="w-5 h-5" />
          <h1 className="text-xl font-extrabold">{getWarehouseDisplayName()}</h1>
        </div>
        <p className="mt-1 text-[12px] text-primary-foreground/80">
          {format(new Date(dateParam), 'EEEE d MMMM', { locale: sv })}
          {window.start && ` · ${window.start}${window.end ? `–${window.end}` : ''}`}
          {summary && ` · ${summary}`}
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Package className="w-6 h-6 mx-auto text-muted-foreground/60 mb-2" />
            <p className="text-sm text-muted-foreground">Inga lageruppgifter denna dag.</p>
          </div>
        ) : (
          assignments.map((item) => {
            const type = resolveAssignmentType(item);
            const action = resolveAction(item);
            const title = resolveTitle(item);
            const tone = ASSIGNMENT_TYPE_TONE[type];
            const subtitleParts: string[] = [];
            if (item.booking_number) subtitleParts.push(item.booking_number);
            if (item.customer_name && item.customer_name !== title) subtitleParts.push(item.customer_name);

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border mb-1.5', tone)}>
                      {ASSIGNMENT_TYPE_LABEL[type]}
                    </div>
                    <h2 className="font-bold text-foreground text-[15px] leading-snug">
                      {title}
                    </h2>
                    {subtitleParts.length > 0 && (
                      <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                        {subtitleParts.join(' · ')}
                      </p>
                    )}
                  </div>
                  {item.status === 'completed' && (
                    <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold shrink-0">
                      Klar
                    </span>
                  )}
                </div>

                {(item.start_time || item.end_time) && (
                  <p className="text-[12px] text-muted-foreground tabular-nums">
                    ⏱ {formatHHMM(item.start_time)}
                    {item.end_time && item.end_time !== item.start_time
                      ? ` – ${formatHHMM(item.end_time)}`
                      : ''}
                  </p>
                )}

                {item.delivery_address && (
                  <div className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{item.delivery_address}</span>
                  </div>
                )}

                {item.description && (
                  <p className="text-[12px] text-muted-foreground leading-snug">
                    {item.description}
                  </p>
                )}

                <button
                  onClick={() => handleAction(item)}
                  className="w-full mt-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold active:opacity-80 transition-opacity"
                >
                  {ASSIGNMENT_ACTION_LABEL[action]}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MobileLagerPage;
