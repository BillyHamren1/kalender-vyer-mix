import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ProjectWithBooking, ProjectTask } from "@/types/project";
import type { MergedSupplier } from "@/types/supplier";
import type { ProjectTransportAssignment } from "@/hooks/useProjectTransport";
import { PHASE_LABELS, PHASE_ORDER, type TaskPhase } from "@/types/project";
import { SUPPLIER_STATUS_LABELS } from "@/types/supplier";
import { PROJECT_STATUS_LABELS } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Printer, FileDown, FileText } from "lucide-react";

interface ProjectPMDocumentProps {
  project: ProjectWithBooking;
  tasks: ProjectTask[];
  suppliers: MergedSupplier[];
  transportAssignments: ProjectTransportAssignment[];
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return format(new Date(d), 'd MMMM yyyy', { locale: sv }); } catch { return '—'; }
};

const formatTime = (d: string | null | undefined) => {
  if (!d) return null;
  try { return format(new Date(d), 'HH:mm'); } catch { return null; }
};

const ProjectPMDocument = ({ project, tasks, suppliers, transportAssignments }: ProjectPMDocumentProps) => {
  const printRef = useRef<HTMLDivElement>(null);
  const booking = project.booking;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    // Use browser print-to-PDF as basic export
    window.print();
  };

  // Gather data
  const clientName = booking?.client || project.client || '—';
  const eventDate = formatDate(booking?.eventdate || project.eventdate);
  const rigDate = formatDate(booking?.rigdaydate || project.rigdaydate);
  const rigdownDate = formatDate(booking?.rigdowndate || project.rigdowndate);
  const address = booking?.deliveryaddress || project.deliveryaddress || '—';
  const city = booking?.delivery_city || project.delivery_city || '';
  const postalCode = booking?.delivery_postal_code || project.delivery_postal_code || '';
  const fullAddress = [address, postalCode, city].filter(Boolean).join(', ');

  const contactName = booking?.contact_name || project.contact_name;
  const contactPhone = booking?.contact_phone || project.contact_phone;
  const contactEmail = booking?.contact_email || project.contact_email;

  const rigStartTime = formatTime(project.rig_start_time);
  const rigEndTime = formatTime(project.rig_end_time);
  const eventStartTime = formatTime(project.event_start_time);
  const eventEndTime = formatTime(project.event_end_time);
  const rigdownStartTime = formatTime(project.rigdown_start_time);
  const rigdownEndTime = formatTime(project.rigdown_end_time);

  const bookingNumber = booking?.booking_number;
  const notes = booking?.internalnotes || project.internalnotes;

  // Timeline tasks grouped by phase
  const timelineTasks = tasks.filter(t => t.phase && t.start_date && t.end_date);
  const tasksByPhase: Partial<Record<TaskPhase, ProjectTask[]>> = {};
  timelineTasks.forEach(t => {
    const phase = t.phase as TaskPhase;
    if (!tasksByPhase[phase]) tasksByPhase[phase] = [];
    tasksByPhase[phase]!.push(t);
  });

  // Regular tasks (no timeline data)
  const regularTasks = tasks.filter(t => !t.phase || !t.start_date);

  // Confirmed suppliers
  const confirmedSuppliers = suppliers.filter(s => s.status === 'confirmed');
  const otherSuppliers = suppliers.filter(s => s.status !== 'confirmed' && s.status !== 'cancelled');

  return (
    <div className="space-y-4">
      {/* Controls — hidden in print */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">PM-dokument</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" />
            Skriv ut
          </Button>
          <Button size="sm" onClick={handleExportPDF} className="gap-1.5">
            <FileDown className="h-3.5 w-3.5" />
            Exportera PDF
          </Button>
        </div>
      </div>

      {/* Document */}
      <div
        ref={printRef}
        data-pm-document
        className="bg-card border border-border rounded-xl p-8 md:p-12 max-w-4xl mx-auto print:border-none print:rounded-none print:p-0 print:max-w-none print:shadow-none"
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      >
        {/* ─── Header ─── */}
        <div className="mb-8 print:mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2 font-sans">
            Produktions-PM
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
            {project.name}
          </h1>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>Kund: <strong className="text-foreground">{clientName}</strong></span>
            {bookingNumber && <span>Bokningsnr: <strong className="text-foreground">{bookingNumber}</strong></span>}
            <span>Status: <strong className="text-foreground">{PROJECT_STATUS_LABELS[project.status]}</strong></span>
          </div>
          {project.project_leader && (
            <p className="text-sm text-muted-foreground mt-1">
              Projektledare: <strong className="text-foreground">{project.project_leader}</strong>
            </p>
          )}
        </div>

        <Separator className="mb-8 print:mb-6" />

        {/* ─── 1. Projektöversikt ─── */}
        <section className="mb-8 print:mb-6">
          <h2 className="text-lg font-bold text-foreground mb-4 font-sans tracking-tight">
            1. Projektöversikt
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <PMField label="Eventdatum" value={eventDate} />
            <PMField label="Plats" value={fullAddress} />
            <PMField label="Riggdag" value={rigDate} extra={rigStartTime && rigEndTime ? `${rigStartTime}–${rigEndTime}` : undefined} />
            <PMField label="Nedrigg" value={rigdownDate} extra={rigdownStartTime && rigdownEndTime ? `${rigdownStartTime}–${rigdownEndTime}` : undefined} />
            {eventStartTime && eventEndTime && (
              <PMField label="Eventtid" value={`${eventStartTime}–${eventEndTime}`} />
            )}
          </div>

          {/* Special conditions */}
          {(booking?.carry_more_than_10m || booking?.ground_nails_allowed === false || booking?.exact_time_needed) && (
            <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/30 print:bg-warning/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-warning-foreground mb-1.5 font-sans">
                Observera
              </p>
              <ul className="text-sm space-y-1 text-foreground">
                {booking?.carry_more_than_10m && <li>• Bärning över 10 meter</li>}
                {booking?.ground_nails_allowed === false && <li>• Markpinnar EJ tillåtet</li>}
                {booking?.exact_time_needed && (
                  <li>• Exakt tid krävs{booking.exact_time_info ? `: ${booking.exact_time_info}` : ''}</li>
                )}
              </ul>
            </div>
          )}
        </section>

        {/* ─── 2. Kontaktlista ─── */}
        <section className="mb-8 print:mb-6">
          <h2 className="text-lg font-bold text-foreground mb-4 font-sans tracking-tight">
            2. Kontaktlista
          </h2>

          {/* Client contact */}
          {(contactName || contactPhone || contactEmail) && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-sans">
                Kund
              </h3>
              <ContactRow name={contactName} phone={contactPhone} email={contactEmail} role={clientName} />
            </div>
          )}

          {/* Internal team */}
          {project.project_leader && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-sans">
                Internt team
              </h3>
              <ContactRow name={project.project_leader} role="Projektledare" />
            </div>
          )}

          {/* Suppliers */}
          {confirmedSuppliers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-sans">
                Underleverantörer
              </h3>
              <div className="space-y-2">
                {confirmedSuppliers.map(s => (
                  <ContactRow
                    key={s.id}
                    name={s.contact_person || s.name}
                    company={s.company_name}
                    phone={s.phone}
                    email={s.email}
                    role={s.service_type || undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── 3. Tidslinje ─── */}
        {(timelineTasks.length > 0 || regularTasks.length > 0) && (
          <section className="mb-8 print:mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4 font-sans tracking-tight">
              3. Tidslinje & uppgifter
            </h2>

            {PHASE_ORDER.map(phase => {
              const phaseTasks = tasksByPhase[phase];
              if (!phaseTasks || phaseTasks.length === 0) return null;
              return (
                <div key={phase} className="mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 font-sans">
                    {PHASE_LABELS[phase]}
                  </h3>
                  <div className="space-y-1">
                    {phaseTasks.map(t => (
                      <div key={t.id} className="flex items-baseline gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {formatDate(t.start_date)} – {formatDate(t.end_date)}
                        </span>
                        <span className={`text-foreground ${t.completed ? 'line-through opacity-60' : ''}`}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {regularTasks.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 font-sans">
                  Övriga uppgifter
                </h3>
                <ul className="space-y-1">
                  {regularTasks.map(t => (
                    <li key={t.id} className="flex items-baseline gap-2 text-sm">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${t.completed ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                      <span className={`text-foreground ${t.completed ? 'line-through opacity-60' : ''}`}>
                        {t.title}
                        {t.deadline && (
                          <span className="text-muted-foreground ml-2">
                            (deadline: {formatDate(t.deadline)})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ─── 4. Leveranser & tjänster ─── */}
        {suppliers.length > 0 && (
          <section className="mb-8 print:mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4 font-sans tracking-tight">
              4. Leveranser & tjänster
            </h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-foreground/20">
                  <th className="text-left py-2 font-semibold font-sans">Leverantör</th>
                  <th className="text-left py-2 font-semibold font-sans">Tjänst</th>
                  <th className="text-left py-2 font-semibold font-sans">Status</th>
                  <th className="text-right py-2 font-semibold font-sans">Pris</th>
                  <th className="text-left py-2 font-semibold font-sans">Leverans</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.filter(s => s.status !== 'cancelled').map(s => (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="py-2">
                      <span className="font-medium">{s.name}</span>
                      {s.company_name && <span className="text-muted-foreground ml-1">({s.company_name})</span>}
                    </td>
                    <td className="py-2 text-muted-foreground">{s.service_type || '—'}</td>
                    <td className="py-2">{SUPPLIER_STATUS_LABELS[s.status]}</td>
                    <td className="py-2 text-right tabular-nums">
                      {(s.confirmed_price ?? s.quoted_price) != null
                        ? `${(s.confirmed_price ?? s.quoted_price)!.toLocaleString('sv-SE')} ${s.currency}`
                        : '—'}
                    </td>
                    <td className="py-2 text-muted-foreground">{s.delivery_date ? formatDate(s.delivery_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {confirmedSuppliers.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-foreground/20">
                    <td colSpan={3} className="py-2 font-semibold font-sans">Totalt bekräftat</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {confirmedSuppliers.reduce((sum, s) => sum + (s.confirmed_price || 0), 0).toLocaleString('sv-SE')} SEK
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </section>
        )}

        {/* ─── 5. Transport ─── */}
        {transportAssignments.length > 0 && (
          <section className="mb-8 print:mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4 font-sans tracking-tight">
              5. Transportdetaljer
            </h2>
            <div className="space-y-3">
              {transportAssignments.map(ta => (
                <div key={ta.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 print:bg-muted/10">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-medium text-sm">
                      {ta.vehicle?.name || 'Okänt fordon'}
                      {ta.vehicle?.vehicle_type && (
                        <span className="text-muted-foreground font-normal ml-1">({ta.vehicle.vehicle_type})</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(ta.transport_date)}
                      {ta.transport_time && ` kl. ${ta.transport_time}`}
                    </span>
                  </div>
                  {ta.vehicle?.contact_person && (
                    <p className="text-xs text-muted-foreground">
                      Kontakt: {ta.vehicle.contact_person}
                      {ta.vehicle.contact_phone && ` · ${ta.vehicle.contact_phone}`}
                    </p>
                  )}
                  {ta.pickup_address && (
                    <p className="text-xs text-muted-foreground">Upphämtning: {ta.pickup_address}</p>
                  )}
                  {ta.driver_notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{ta.driver_notes}"</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── 6. Anteckningar ─── */}
        {notes && (
          <section className="mb-8 print:mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4 font-sans tracking-tight">
              {transportAssignments.length > 0 ? '6' : suppliers.length > 0 ? '5' : '4'}. Anteckningar
            </h2>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 print:bg-muted/10">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{notes}</p>
            </div>
          </section>
        )}

        {/* ─── Footer ─── */}
        <Separator className="mt-8 mb-4 print:mt-6" />
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>Genererat {format(new Date(), "d MMMM yyyy 'kl.' HH:mm", { locale: sv })}</span>
          <span className="font-sans">Konfidentiellt · Intern användning</span>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          [data-pm-document], [data-pm-document] * { visibility: visible; }
          .print\\:hidden { display: none !important; }
          @page { margin: 2cm; size: A4; }
        }
      `}</style>
    </div>
  );
};

/* ── Subcomponents ── */

const PMField = ({ label, value, extra }: { label: string; value: string; extra?: string }) => (
  <div className="flex flex-col">
    <span className="text-xs text-muted-foreground font-sans">{label}</span>
    <span className="text-sm text-foreground font-medium">
      {value}
      {extra && <span className="text-muted-foreground font-normal ml-1.5">{extra}</span>}
    </span>
  </div>
);

const ContactRow = ({ name, company, phone, email, role }: {
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string;
}) => (
  <div className="flex items-baseline gap-4 text-sm py-1.5 border-b border-border/30 last:border-0">
    {role && <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider w-24 shrink-0 font-sans">{role}</span>}
    <span className="font-medium text-foreground">{name || '—'}</span>
    {company && <span className="text-muted-foreground">{company}</span>}
    {phone && <span className="text-muted-foreground">{phone}</span>}
    {email && <span className="text-muted-foreground">{email}</span>}
  </div>
);

export default ProjectPMDocument;
