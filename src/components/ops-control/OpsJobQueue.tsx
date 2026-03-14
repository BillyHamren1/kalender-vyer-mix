import { OpsJobQueueItem } from '@/services/opsControlService';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Clock, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  jobs: OpsJobQueueItem[];
  isLoading: boolean;
}

const issueConfig = {
  no_staff: { icon: AlertTriangle, label: 'Saknar personal', cls: 'text-destructive bg-destructive/10' },
  starting_soon: { icon: Clock, label: 'Startar snart', cls: 'text-amber-600 bg-amber-500/10' },
  unopened: { icon: Eye, label: 'Ej öppnad', cls: 'text-muted-foreground bg-muted' },
};

const OpsJobQueue = ({ jobs, isLoading }: Props) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Jobb som behöver åtgärd</div>
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Jobb som behöver åtgärd — {jobs.length}
      </div>

      {jobs.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">✓ Alla jobb ser bra ut</div>
      ) : (
        <div className="space-y-1">
          {jobs.map(job => {
            const config = issueConfig[job.issue];
            const Icon = config.icon;

            return (
              <div
                key={job.bookingId}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/booking/${job.bookingId}`)}
              >
                <div className={`p-1 rounded ${config.cls}`}>
                  <Icon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {job.bookingNumber ? `#${job.bookingNumber} — ` : ''}{job.client}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {job.deliveryAddress || 'Ingen adress'}
                  </div>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${config.cls} shrink-0`}>
                  {config.label}
                </span>
                {job.assignedStaffCount > 0 && (
                  <span className="text-[9px] text-muted-foreground shrink-0">{job.assignedStaffCount} pers</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OpsJobQueue;
