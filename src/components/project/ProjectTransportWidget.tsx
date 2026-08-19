import React, { useState } from 'react';
import { Truck, AlertTriangle, Clock, CheckCircle2, Mail, Send, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  useProjectTransport,
  ProjectTransportAssignment,
  TransportEmailLogEntry,
} from '@/hooks/useProjectTransport';
import ProjectTransportBookingDialog from './ProjectTransportBookingDialog';
import TransportPlanningDialog from '@/components/logistics/TransportPlanningDialog';

interface ProjectTransportWidgetProps {
  bookingId: string | null | undefined;
}

// Simplified transport card for project context (uses project transport data shape)
const ProjectCard = ({
  assignment,
  expanded,
  onToggle,
  cardBg,
  cardBorder,
  emailLogs,
  onSetPlanningStatus,
}: {
  assignment: ProjectTransportAssignment;
  expanded: boolean;
  onToggle: () => void;
  cardBg: string;
  cardBorder: string;
  emailLogs: TransportEmailLogEntry[];
  onSetPlanningStatus: (status: 'preliminary' | 'confirmed') => void;
}) => {
  const vehicle = assignment.vehicle;
  const isExternal = vehicle?.is_external ?? false;
  const response = assignment.partner_response;

  const isPlanningConfirmed = assignment.planning_status === 'confirmed' || assignment.partner_response === 'accepted';
  const statusLabel = isPlanningConfirmed ? 'Bekräftad' : 'Preliminär';
  const statusDot = isPlanningConfirmed ? 'bg-emerald-500' : 'bg-amber-500';

  const assignmentEmails = emailLogs.filter(e => e.assignment_id === assignment.id);

  const formatDateTime = (d: string | null) => {
    if (!d) return '—';
    try { return format(new Date(d), 'd MMM yyyy HH:mm', { locale: sv }); } catch { return d; }
  };

  return (
    <div
      className={cn(
        `rounded-lg ${cardBg} border ${cardBorder} shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden`,
        expanded && 'ring-1 ring-primary/30'
      )}
      onClick={onToggle}
    >
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="px-2 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-teal-50 text-teal-700 border-teal-200">
            TRANSPORT
          </span>
          {isExternal && (
            <span className="text-[10px] text-muted-foreground">Extern</span>
          )}
          <Truck className="w-3.5 h-3.5 ml-auto text-primary/60" />
        </div>

        <h4 className="font-semibold text-sm text-foreground line-clamp-2 mb-1">
          {vehicle?.name || 'Fordon ej bestämt'}
        </h4>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Clock className="w-3 h-3" />
          {assignment.transport_date}
          {assignment.transport_time ? ` kl ${assignment.transport_time.slice(0, 5)}` : ''}{assignment.transport_end_time ? `–${assignment.transport_end_time.slice(0, 5)}` : ''}
        </div>

        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', statusDot)} />
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
          {assignmentEmails.length > 0 && (
            <Badge variant="outline" className="ml-auto text-[10px] gap-0.5 h-4 px-1">
              <Mail className="h-2.5 w-2.5" />
              {assignmentEmails.length}
            </Badge>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border/30 space-y-2" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 text-xs">
            {(assignment.origin_address || assignment.pickup_address) && (
              <div>
                <p className="text-muted-foreground text-[10px]">Från</p>
                <p className="font-medium">{assignment.origin_address || assignment.pickup_address}</p>
              </div>
            )}
            {assignment.destination_address && (
              <div>
                <p className="text-muted-foreground text-[10px]">Till</p>
                <p className="font-medium">{assignment.destination_address}</p>
              </div>
            )}
            {vehicle?.contact_person && (
              <div>
                <p className="text-muted-foreground text-[10px]">Kontaktperson</p>
                <p className="font-medium">{vehicle.contact_person}</p>
                {vehicle.contact_phone && (
                  <p className="text-muted-foreground">{vehicle.contact_phone}</p>
                )}
              </div>
            )}
          </div>

          {assignment.driver_notes && (
            <div className="text-xs">
              <p className="text-muted-foreground text-[10px]">Förarnoteringar</p>
              <p className="font-medium">{assignment.driver_notes}</p>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            {isPlanningConfirmed ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSetPlanningStatus('preliminary')}>
                Gör preliminär
              </Button>
            ) : (
              <Button size="sm" className="h-7 text-xs" onClick={() => onSetPlanningStatus('confirmed')}>
                Bekräfta transport
              </Button>
            )}
          </div>

          {/* Partner response */}
          {isExternal && assignment.partner_responded_at && (
            <>
              <Separator />
              <div className="text-xs">
                <p className="text-muted-foreground text-[10px] mb-1">Partnersvar</p>
                <p className="font-medium">
                  {response === 'accepted' ? '✅ Accepterad' : '❌ Nekad'} — {formatDateTime(assignment.partner_responded_at)}
                </p>
              </div>
            </>
          )}

          {/* Email history */}
          {assignmentEmails.length > 0 && (
            <>
              <Separator />
              <div className="text-xs">
                <p className="text-muted-foreground text-[10px] mb-1">Mejlhistorik</p>
                <div className="space-y-1.5">
                  {assignmentEmails.map(email => (
                    <div key={email.id} className="flex items-start gap-2 p-2 rounded bg-background/50 border border-border/30">
                      <Send className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{email.subject}</p>
                        <p className="text-muted-foreground">
                          Till: {email.recipient_name || email.recipient_email} · {formatDateTime(email.sent_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const ProjectTransportWidget: React.FC<ProjectTransportWidgetProps> = ({ bookingId }) => {
  const { assignments, emailLogs, isLoading, refetch, updateAssignment } = useProjectTransport(bookingId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [planningDialogOpen, setPlanningDialogOpen] = useState(false);

  if (!bookingId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>Ingen bokning kopplad till detta projekt</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
      </div>
    );
  }

  const isConfirmed = (a: ProjectTransportAssignment) => a.planning_status === 'confirmed' || a.partner_response === 'accepted';
  const preliminary = assignments.filter(a => !isConfirmed(a) && a.status !== 'delivered');
  const confirmed = assignments.filter(a => isConfirmed(a) && a.status !== 'delivered');
  const completed = assignments.filter(a => a.status === 'delivered');

  const columns = [
    {
      title: 'Preliminära',
      icon: Clock,
      items: preliminary,
      color: 'text-amber-600',
      bgColor: 'bg-white',
      borderColor: 'border-border/40',
      cardBg: 'bg-amber-50',
      cardBorder: 'border-amber-200',
    },
    {
      title: 'Bekräftade',
      icon: CheckCircle2,
      items: confirmed,
      color: 'text-emerald-600',
      bgColor: 'bg-white',
      borderColor: 'border-border/40',
      cardBg: 'bg-emerald-50',
      cardBorder: 'border-emerald-200',
    },
    {
      title: 'Utförda',
      icon: CheckCircle2,
      items: completed,
      color: 'text-muted-foreground',
      bgColor: 'bg-white',
      borderColor: 'border-border/40',
      cardBg: 'bg-slate-50',
      cardBorder: 'border-slate-200',
    },
  ];

  const totalCount = assignments.length;

  return (
    <>
      <Card className="border-border/40 shadow-2xl rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-3 tracking-tight">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-icon)', boxShadow: 'var(--shadow-icon)' }}
            >
              <Truck className="h-4 w-4 text-primary-foreground" />
            </div>
            Transportbokningar
            <div className="ml-auto flex items-center gap-2">
              {totalCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {totalCount} transport{totalCount !== 1 ? 'er' : ''}
                </Badge>
              )}
              <Button
                size="sm"
                onClick={() => setPlanningDialogOpen(true)}
                className="rounded-xl gap-1.5 h-8 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Planera transport
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBookingDialogOpen(true)}
                className="rounded-xl h-8 text-xs"
              >
                Fordon / partner
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-0">
          {assignments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Inga transporter planerade</p>
              <p className="text-sm mt-1">Skapa transporten först — fordon kan bestämmas senare.</p>
              <Button
                size="sm"
                onClick={() => setPlanningDialogOpen(true)}
                className="mt-4 rounded-xl gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Planera transport
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {columns.map(col => (
                <div key={col.title} className={cn('rounded-xl border p-3', col.bgColor, col.borderColor)}>
                  <div className="flex items-center gap-2 mb-3">
                    <col.icon className={cn('w-4 h-4', col.color)} />
                    <h3 className={cn('text-xs font-semibold', col.color)}>{col.title}</h3>
                    <span className={cn('ml-auto text-sm font-bold', col.color)}>{col.items.length}</span>
                  </div>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {col.items.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-6">Inga transporter</p>
                    ) : (
                      col.items.map(a => (
                        <ProjectCard
                          key={a.id}
                          assignment={a}
                          expanded={expandedId === a.id}
                          onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                          cardBg={col.cardBg}
                          cardBorder={col.cardBorder}
                          emailLogs={emailLogs}
                          onSetPlanningStatus={async (status) => {
                            try {
                              await updateAssignment(a.id, { planning_status: status });
                            } catch (error: any) {
                              console.error('[ProjectTransportWidget] status update failed', error);
                            }
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TransportPlanningDialog
        bookingId={bookingId}
        open={planningDialogOpen}
        onOpenChange={setPlanningDialogOpen}
        onSaved={refetch}
      />

      <ProjectTransportBookingDialog
        bookingId={bookingId}
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        onComplete={refetch}
      />
    </>
  );
};

export default ProjectTransportWidget;
