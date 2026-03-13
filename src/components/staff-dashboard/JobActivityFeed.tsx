import { JobActivityItem } from '@/services/staffDashboardService';
import { MessageCircle, Image, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';

interface JobActivityFeedProps {
  activity: JobActivityItem[];
  isLoading: boolean;
}

const typeConfig = {
  comment: { icon: MessageCircle, label: 'Kommentar', color: 'text-primary bg-primary/10' },
  file: { icon: Image, label: 'Bild/fil', color: 'text-accent-foreground bg-accent' },
  time_report: { icon: Clock, label: 'Tidrapport', color: 'text-primary bg-primary/10' },
};

const JobActivityFeed = ({ activity, isLoading }: JobActivityFeedProps) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-bold text-foreground mb-3">Jobbaktivitet (24h)</h2>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {activity.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Ingen aktivitet senaste 24h</p>
        ) : (
          activity.map((item) => {
            const cfg = typeConfig[item.type];
            const Icon = cfg.icon;
            return (
              <div key={item.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className={`p-1 rounded-lg mt-0.5 ${cfg.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{item.author}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: sv })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.content}</p>
                    {item.project_name && (
                      <span className="text-[10px] text-primary font-medium">{item.project_name}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default JobActivityFeed;
