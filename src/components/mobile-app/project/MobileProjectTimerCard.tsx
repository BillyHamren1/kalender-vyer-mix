import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Clock, FolderOpen } from 'lucide-react';
import { useMobileTimeReports } from '@/hooks/useMobileData';

interface Props {
  largeProjectId: string;
  projectName: string;
}

const formatHours = (h: number) => h.toFixed(1).replace('.', ',');

/**
 * MobileProjectTimerCard
 * ----------------------
 * Single-timer policy: kortet startar/stoppar INTE timer. Det visar
 * bara passiv info om hur mycket tid som loggats på projektet idag.
 * All arbetsdagsstart/-stopp sker i WorkDayPanel.
 */
export const MobileProjectTimerCard = ({ largeProjectId, projectName }: Props) => {
  const navigate = useNavigate();
  const { data: timeReports = [] } = useMobileTimeReports();

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const loggedTodayHours = useMemo(() => {
    return timeReports
      .filter(
        (r: any) =>
          r.large_project_id === largeProjectId &&
          r.report_date === todayKey &&
          !r.is_subdivision,
      )
      .reduce((sum: number, r: any) => sum + (Number(r.hours_worked) || 0), 0);
  }, [timeReports, largeProjectId, todayKey]);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <FolderOpen className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Tid på projektet
        </span>
      </div>

      <p className="text-sm font-semibold text-foreground truncate">{projectName}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        Starta och avsluta arbetsdagen i översikten — den här vyn visar bara hur mycket
        tid som loggats på projektet hittills idag.
      </p>

      <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loggat idag:</span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {formatHours(loggedTodayHours)} h
        </span>
        {loggedTodayHours > 0 && (
          <button
            onClick={() => navigate('/m/time-history')}
            className="ml-auto text-[11px] font-semibold text-primary active:opacity-70"
          >
            Visa
          </button>
        )}
      </div>
    </div>
  );
};

export default MobileProjectTimerCard;
