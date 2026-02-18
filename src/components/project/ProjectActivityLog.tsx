import { useState, useMemo } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { 
  CheckCircle2, MessageSquare, FileUp, ArrowRightLeft, 
  Trash2, PlusCircle, Filter, Clock, Truck, Mail, Send,
  ChevronDown, ChevronRight, User, Calendar, MapPin, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ProjectActivity } from "@/services/projectActivityService";
import { cn } from "@/lib/utils";

interface ProjectActivityLogProps {
  activities: ProjectActivity[];
  className?: string;
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

// Detail row for metadata
const MetadataDetail = ({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) => {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
};

const ActivityDetailContent = ({ activity }: { activity: ProjectActivity }) => {
  const meta = (activity.metadata || {}) as Record<string, any>;
  const hasDetails = Object.keys(meta).length > 0;

  if (!hasDetails && activity.action !== 'email_snapshot') return null;

  return (
    <div className="ml-7 mt-1 mb-2 p-3 rounded-lg bg-muted/40 border border-border/30 space-y-1.5">
      {/* Transport details */}
      {(activity.action === 'transport_added' || activity.action === 'transport_updated') && (
        <>
          <MetadataDetail label="Fordon" value={meta.vehicle_name} icon={Truck} />
          <MetadataDetail label="Datum" value={meta.transport_date} icon={Calendar} />
          <MetadataDetail label="Tid" value={meta.transport_time} icon={Clock} />
          <MetadataDetail label="Upphämtning" value={meta.pickup_address} icon={MapPin} />
          <MetadataDetail label="Status" value={
            meta.status === 'pending' ? 'Väntar på svar' :
            meta.status === 'accepted' ? 'Accepterad' :
            meta.status === 'declined' ? 'Nekad' :
            meta.status
          } />
        </>
      )}

      {/* Transport response details */}
      {(activity.action === 'transport_response' || activity.action === 'transport_declined') && (
        <>
          <MetadataDetail label="Partner" value={meta.partner_name} icon={User} />
          <MetadataDetail label="Fordon" value={meta.vehicle_name} icon={Truck} />
          <MetadataDetail label="Svar" value={
            meta.response_type === 'accepted' ? '✅ Accepterad' :
            meta.response_type === 'declined' ? '❌ Nekad' :
            meta.response_type
          } />
          {meta.responded_at && (
            <MetadataDetail label="Svarstid" value={format(new Date(meta.responded_at), 'HH:mm d MMM yyyy', { locale: sv })} icon={Clock} />
          )}
        </>
      )}

      {/* Email details */}
      {(activity.action === 'email_sent' || activity.action === 'email_snapshot') && (
        <>
          <MetadataDetail label="Mottagare" value={meta.recipient_name || meta.recipient_email} icon={User} />
          {meta.recipient_email && meta.recipient_name && (
            <MetadataDetail label="E-post" value={meta.recipient_email} icon={Mail} />
          )}
          <MetadataDetail label="Ämne" value={meta.subject} />
          {meta.image_url && (
            <a
              href={meta.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block"
            >
              <img
                src={meta.image_url}
                alt="Mejlförhandsgranskning"
                className="max-w-xs rounded-lg border border-border/40 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              />
              <span className="text-xs text-primary flex items-center gap-1 mt-1">
                <ExternalLink className="h-3 w-3" /> Visa mejl i helskärm
              </span>
            </a>
          )}
        </>
      )}

      {/* Status change details */}
      {activity.action === 'status_changed' && (
        <>
          <MetadataDetail label="Från" value={meta.old_status} />
          <MetadataDetail label="Till" value={meta.new_status} />
        </>
      )}

      {/* Comment preview */}
      {activity.action === 'comment_added' && meta.preview && (
        <p className="text-xs text-muted-foreground italic">"{meta.preview}"</p>
      )}

      {/* Task details */}
      {activity.action === 'task_completed' && (
        <>
          <MetadataDetail label="Slutförd av" value={meta.completed_by} icon={User} />
        </>
      )}

      {/* Generic metadata fallback for items without specific rendering */}
      {!['transport_added','transport_updated','transport_response','transport_declined',
         'email_sent','email_snapshot','status_changed','comment_added','task_completed'
        ].includes(activity.action) && hasDetails && (
        <div className="text-xs text-muted-foreground">
          {Object.entries(meta).map(([key, val]) => (
            <MetadataDetail key={key} label={key} value={String(val)} />
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectActivityLog = ({ activities, className }: ProjectActivityLogProps) => {
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

  const hasExpandableContent = (activity: ProjectActivity) => {
    const meta = activity.metadata as Record<string, any> | null;
    return (meta && Object.keys(meta).length > 0) || activity.action === 'email_snapshot';
  };

  return (
    <Card className={`border-border/40 shadow-2xl rounded-2xl${className ? ` ${className}` : ''}`}>
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
                <div className="space-y-0.5">
                  {dayActivities.map((activity) => {
                    const config = ACTION_CONFIG[activity.action] || {
                      icon: PlusCircle,
                      color: 'text-muted-foreground',
                      label: 'Övrigt'
                    };
                    const Icon = config.icon;
                    const expandable = hasExpandableContent(activity);

                    if (!expandable) {
                      return (
                        <div
                          key={activity.id}
                          className="flex items-start gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors"
                        >
                          <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">{activity.description}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {activity.performed_by && (
                                <span className="text-xs text-muted-foreground font-medium">{activity.performed_by}</span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(activity.created_at), 'HH:mm', { locale: sv })}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <Collapsible key={activity.id}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-start gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer group">
                            <div className={`mt-0.5 flex-shrink-0 ${config.color}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm text-foreground">{activity.description}</p>
                                <ChevronRight className="h-3 w-3 text-muted-foreground group-data-[state=open]:hidden" />
                                <ChevronDown className="h-3 w-3 text-muted-foreground hidden group-data-[state=open]:block" />
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {activity.performed_by && (
                                  <span className="text-xs text-muted-foreground font-medium">{activity.performed_by}</span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(activity.created_at), 'HH:mm', { locale: sv })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ActivityDetailContent activity={activity} />
                        </CollapsibleContent>
                      </Collapsible>
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
