/**
 * LagerDayCard — appears in MobileJobs when the user has any warehouse work
 * for the selected day (warehouse_assignments OR a staff_assignments row on
 * a Lager team — the Lager-list edge action returns both).
 *
 * Acts as the entry point for the internal "Lager" hub at /m/lager.
 */
import { useNavigate } from 'react-router-dom';
import { Building2, Package, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useLagerAssignments } from '@/hooks/useLagerAssignments';
import { dayTimeWindow, summarizeTypes } from '@/lib/warehouse/lagerLabels';
import { getWarehouseDisplayName } from '@/lib/warehouse/warehouseTeam';

interface Props {
  /** YYYY-MM-DD */
  date: Date;
}

const LagerDayCard: React.FC<Props> = ({ date }) => {
  const navigate = useNavigate();
  const dateStr = format(date, 'yyyy-MM-dd');
  const { assignments, loading } = useLagerAssignments({ date: dateStr });

  if (loading || assignments.length === 0) return null;

  const window = dayTimeWindow(assignments);
  const summary = summarizeTypes(assignments);
  const count = assignments.length;
  const name = getWarehouseDisplayName();

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Lager
        </h2>
      </div>
      <button
        onClick={() => navigate(`/m/lager?date=${dateStr}`)}
        className="w-full text-left rounded-2xl border border-primary/20 bg-card p-4 shadow-md active:opacity-80 transition-all"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-foreground text-[16px] leading-tight">{name}</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
                Internt
              </span>
            </div>
            {(window.start || window.end) && (
              <p className="text-[12px] text-muted-foreground tabular-nums mt-0.5">
                {window.start}
                {window.end && window.end !== window.start ? `–${window.end}` : ''}
                {' · '}
                {count} {count === 1 ? 'uppgift' : 'uppgifter'}
              </p>
            )}
            {summary && (
              <p className="text-[12px] text-foreground/80 mt-1 truncate">{summary}</p>
            )}
            <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-primary">
              Öppna lageruppgifter
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </button>
    </div>
  );
};

export default LagerDayCard;
