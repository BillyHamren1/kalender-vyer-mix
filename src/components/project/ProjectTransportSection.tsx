import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Truck, Mail, Clock, CheckCircle, XCircle, AlertCircle,
  MapPin, Calendar, Phone, User, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import {
  useProjectTransport,
  ProjectTransportAssignment,
  TransportEmailLogEntry,
} from "@/hooks/useProjectTransport";

interface ProjectTransportSectionProps {
  bookingId: string | null | undefined;
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: "Väntar på svar", icon: Clock, className: "bg-amber-100 text-amber-800 border-amber-200" },
  accepted: { label: "Accepterad", icon: CheckCircle, className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  declined: { label: "Nekad", icon: XCircle, className: "bg-red-100 text-red-800 border-red-200" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "d MMM yyyy", { locale: sv });
  } catch {
    return d;
  }
}

function formatDateTime(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "d MMM yyyy HH:mm", { locale: sv });
  } catch {
    return d;
  }
}

function AssignmentCard({
  assignment,
  emailLogs,
}: {
  assignment: ProjectTransportAssignment;
  emailLogs: TransportEmailLogEntry[];
}) {
  const [open, setOpen] = useState(false);
  const vehicle = assignment.vehicle;
  const isExternal = vehicle?.is_external ?? false;
  const response = assignment.partner_response;
  const status = response && statusConfig[response] ? statusConfig[response] : null;
  const StatusIcon = status?.icon || AlertCircle;

  const assignmentEmails = emailLogs.filter((e) => e.assignment_id === assignment.id);

  return (
    <Card className="border border-border/60 shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-4 px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Truck className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold truncate">
                    {vehicle?.name || "Okänt fordon"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(assignment.transport_date)}
                    {assignment.transport_time ? ` kl ${assignment.transport_time}` : ""}
                    {isExternal ? " • Extern partner" : " • Intern"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isExternal && status && (
                  <Badge variant="outline" className={`text-xs gap-1 ${status.className}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </Badge>
                )}
                {!isExternal && (
                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                    Intern
                  </Badge>
                )}
                {assignmentEmails.length > 0 && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Mail className="h-3 w-3" />
                    {assignmentEmails.length}
                  </Badge>
                )}
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-5 pb-5 space-y-4">
            {/* Transport details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Transportdatum</p>
                  <p className="font-medium">{formatDate(assignment.transport_date)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Tid</p>
                  <p className="font-medium">{assignment.transport_time || "Ej angiven"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-muted-foreground text-xs">Upphämtning</p>
                  <p className="font-medium">{assignment.pickup_address || "Ej angiven"}</p>
                </div>
              </div>
              {isExternal && vehicle?.contact_person && (
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-muted-foreground text-xs">Kontaktperson</p>
                    <p className="font-medium">{vehicle.contact_person}</p>
                    {vehicle.contact_phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />
                        {vehicle.contact_phone}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {assignment.driver_notes && (
              <div className="text-sm p-3 rounded-lg bg-muted/50 border border-border/40">
                <p className="text-xs text-muted-foreground mb-1 font-medium">Förarenoteringar</p>
                <p>{assignment.driver_notes}</p>
              </div>
            )}

            {/* Partner response timeline */}
            {isExternal && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Partnersvar
                  </p>
                  {assignment.partner_responded_at ? (
                    <div className="flex items-center gap-2 text-sm">
                      <StatusIcon className="h-4 w-4" />
                      <span className="font-medium">
                        {response === "accepted" ? "Accepterad" : "Nekad"}
                      </span>
                      <span className="text-muted-foreground">
                        — {formatDateTime(assignment.partner_responded_at)}
                      </span>
                    </div>
                  ) : response === "pending" ? (
                    <p className="text-sm text-amber-700 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Väntar på svar från partner...
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Inget mejl skickat ännu</p>
                  )}
                </div>
              </>
            )}

            {/* Email history */}
            {assignmentEmails.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Mejlhistorik
                  </p>
                  <div className="space-y-2">
                    {assignmentEmails.map((email) => (
                      <div
                        key={email.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 text-sm"
                      >
                        <Send className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{email.subject}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Till: {email.recipient_name || email.recipient_email} ({email.recipient_email})
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(email.sent_at)}
                          </p>
                          {email.custom_message && (
                            <p className="text-xs mt-2 p-2 rounded bg-background border border-border/40 whitespace-pre-line">
                              {email.custom_message}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

const ProjectTransportSection = ({ bookingId }: ProjectTransportSectionProps) => {
  const { assignments, emailLogs, isLoading } = useProjectTransport(bookingId);

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
        {[1, 2].map((i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Inga transporter bokade</p>
        <p className="text-sm mt-1">
          Boka transporter via{" "}
          <span className="text-primary font-medium">Transport Dashboard → Boka transport</span>
        </p>
      </div>
    );
  }

  // Summary counts
  const external = assignments.filter((a) => a.vehicle?.is_external);
  const pending = external.filter((a) => a.partner_response === "pending").length;
  const accepted = external.filter((a) => a.partner_response === "accepted").length;
  const declined = external.filter((a) => a.partner_response === "declined").length;
  const totalEmails = emailLogs.length;

  return (
    <div className="space-y-5">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1">
          <Truck className="h-3 w-3" />
          {assignments.length} transport{assignments.length !== 1 ? "er" : ""}
        </Badge>
        {pending > 0 && (
          <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-800 border-amber-200">
            <Clock className="h-3 w-3" />
            {pending} väntar
          </Badge>
        )}
        {accepted > 0 && (
          <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-200">
            <CheckCircle className="h-3 w-3" />
            {accepted} accepterade
          </Badge>
        )}
        {declined > 0 && (
          <Badge variant="outline" className="gap-1 bg-red-50 text-red-800 border-red-200">
            <XCircle className="h-3 w-3" />
            {declined} nekade
          </Badge>
        )}
        {totalEmails > 0 && (
          <Badge variant="outline" className="gap-1">
            <Mail className="h-3 w-3" />
            {totalEmails} mejl skickade
          </Badge>
        )}
      </div>

      {/* Assignment cards */}
      <div className="space-y-3">
        {assignments.map((assignment) => (
          <AssignmentCard key={assignment.id} assignment={assignment} emailLogs={emailLogs} />
        ))}
      </div>
    </div>
  );
};

export default ProjectTransportSection;
