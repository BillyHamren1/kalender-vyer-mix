import { useState, useMemo } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { 
  CheckCircle2, MessageSquare, FileUp, ArrowRightLeft, 
  Trash2, PlusCircle, Filter, Clock, Truck, Mail, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectActivity } from "@/services/projectActivityService";

interface ProjectActivityLogProps {
  activities: ProjectActivity[];
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  status_changed: { icon: ArrowRightLeft, color: 'text-amber-500', label: 'Status' },
  task_added: { icon: PlusCircle, color: 'text-primary', label: 'Uppgift' },
  task_completed: { icon: CheckCircle2, color: 'text-primary', label: 'Uppgift' },
  task_deleted: { icon: Trash2, color: 'text-destructive', label: 'Uppgift' },
  comment_added: { icon: MessageSquare, color: 'text-primary', label: 'Kommentar' },
  file_uploaded: { icon: FileUp, color: 'text-primary', label: 'Fil' },
  file_deleted: { icon: Trash2, color: 'text-destructive', label: 'Fil' },
  transport_added: { icon: Truck, color: 'text-primary', label: 'Transport' },
  transport_updated: { icon: Truck, color: 'text-amber-500', label: 'Transport' },
  transport_response: { icon: CheckCircle2, color: 'text-primary', label: 'Transport' },
  transport_declined: { icon: Truck, color: 'text-destructive', label: 'Transport' },
  email_sent: { icon: Send, color: 'text-primary', label: 'Mejl' },
  email_snapshot: { icon: Mail, color: 'text-primary', label: 'Mejl' },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'Alla' },
  { value: 'status_changed', label: 'Status' },
  { value: 'task', label: 'Uppgifter' },
  { value: 'comment_added', label: 'Kommentarer' },
  { value: 'file', label: 'Filer' },
  { value: 'transport', label: 'Transport' },
];

const ProjectActivityLog = ({ activities }: ProjectActivityLogProps) => {
  const [filter, setFilter] = useState('all');

  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities;
    if (filter === 'task') return activities.filter(a => a.action.startsWith('task_'));
    if (filter === 'file') return activities.filter(a => a.action.startsWith('file_'));
    if (filter === 'transport') return activities.filter(a => a.action.startsWith('transport_') || a.action === 'email_sent' || a.action === 'email_snapshot');
    return activities.filter(a => a.action === filter);
  }, [activities, filter]);

  const groupedActivities = useMemo(() => {
    const groups: Record<string, ProjectActivity[]> = {};
    filteredActivities.forEach(activity => {
      const dateKey = format(new Date(activity.created_at), 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(activity);
    });
    return groups;
  }, [filteredActivities]);

  return (
    <Card className="border-border/40 shadow-2xl rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-3 tracking-tight">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-icon)', boxShadow: 'var(--shadow-icon)' }}
            >
              <Clock className="h-4 w-4 text-primary-foreground" />
            </div>
            Aktivitetslogg
          </CardTitle>
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
            {FILTER_OPTIONS.map(option => (
              <Button
                key={option.value}
                variant={filter === option.value ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredActivities.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Ingen aktivitet ännu</p>
            <p className="text-xs text-muted-foreground mt-1">
              Aktiviteter loggas automatiskt när du gör förändringar i projektet
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([dateKey, dayActivities]) => (
              <div key={dateKey}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 sticky top-0 bg-card py-1">
                  {format(new Date(dateKey), 'EEEE d MMMM yyyy', { locale: sv })}
                </h4>
                <div className="space-y-1">
                  {dayActivities.map((activity) => {
                    const config = ACTION_CONFIG[activity.action] || {
                      icon: PlusCircle,
                      color: 'text-muted-foreground',
                      label: 'Övrigt'
                    };
                    const Icon = config.icon;
                    
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors group"
                      >
                        <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">{activity.description}</p>
                          {activity.action === 'email_snapshot' && (activity.metadata as any)?.image_url && (
                            <a
                              href={(activity.metadata as any).image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 block"
                            >
                              <img
                                src={(activity.metadata as any).image_url}
                                alt="Mejlförhandsgranskning"
                                className="max-w-xs rounded-lg border border-border/40 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                              />
                            </a>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            {activity.performed_by && (
                              <span className="text-xs text-muted-foreground font-medium">
                                {activity.performed_by}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(activity.created_at), 'HH:mm', { locale: sv })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectActivityLog;
