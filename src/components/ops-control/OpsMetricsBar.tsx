import { OpsMetrics } from '@/services/opsControlService';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Briefcase, Users, AlertTriangle, Clock, Activity, UserCheck, ShieldAlert
} from 'lucide-react';

interface OpsMetricsBarProps {
  metrics: OpsMetrics | undefined;
  isLoading: boolean;
}

const items = [
  { key: 'totalJobsToday' as const, label: 'Jobb idag', icon: Briefcase },
  { key: 'staffScheduledToday' as const, label: 'Schemalagd personal', icon: Users },
  { key: 'jobsMissingStaff' as const, label: 'Saknar personal', icon: AlertTriangle, alert: true },
  { key: 'jobsStartingSoon' as const, label: 'Startar <2h', icon: Clock, warn: true },
  { key: 'activeJobsNow' as const, label: 'Aktiva nu', icon: Activity },
  { key: 'staffCheckedIn' as const, label: 'Incheckade', icon: UserCheck },
  { key: 'conflictsDetected' as const, label: 'Konflikter', icon: ShieldAlert, alert: true },
];

const OpsMetricsBar = ({ metrics, isLoading }: OpsMetricsBarProps) => {
  if (isLoading || !metrics) {
    return (
      <div className="flex gap-4 py-1">
        {items.map((_, i) => <Skeleton key={i} className="h-10 w-28 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-2 shrink-0">OPS</span>
      {items.map(item => {
        const value = metrics[item.key];
        const Icon = item.icon;
        const isAlert = (item.alert || item.warn) && value > 0;

        return (
          <div
            key={item.key}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg shrink-0 transition-colors ${
              isAlert && item.alert
                ? 'bg-destructive/10 text-destructive'
                : isAlert && item.warn
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-muted/50 text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5 opacity-60" />
            <span className="text-lg font-bold leading-none tabular-nums">{value}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default OpsMetricsBar;
