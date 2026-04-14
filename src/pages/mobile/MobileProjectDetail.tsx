import { useParams, useNavigate } from 'react-router-dom';
import { MobileBooking } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useMobileBookings } from '@/hooks/useMobileData';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin, ChevronRight, Loader2, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const eventTypeBadge = (dates: { rigdaydate: string | null; eventdate: string | null; rigdowndate: string | null }, assignmentDate: string) => {
  if (dates.rigdaydate === assignmentDate) return { label: 'RIGG', className: 'bg-planning-rig text-planning-rig-foreground border-planning-rig-border' };
  if (dates.eventdate === assignmentDate) return { label: 'EVENT', className: 'bg-planning-event text-planning-event-foreground border-planning-event-border' };
  if (dates.rigdowndate === assignmentDate) return { label: 'NEDMONT.', className: 'bg-planning-rigdown text-planning-rigdown-foreground border-planning-rigdown-border' };
  return { label: 'JOBB', className: 'bg-muted text-foreground border-border' };
};

const MobileProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { data: bookings = [], isLoading } = useMobileBookings();

  // Find all bookings belonging to this project
  const projectBookings = bookings.filter(b => b.large_project_id === projectId);
  const projectName = projectBookings[0]?.large_project_name || 'Projekt';

  // Split into scheduled (user is assigned) and project-member-only
  const scheduled = projectBookings.filter(b => b.assignment_type === 'scheduled');
  const memberOnly = projectBookings.filter(b => b.assignment_type !== 'scheduled');

  // Sort by earliest date
  const sortByDate = (a: MobileBooking, b: MobileBooking) => {
    const dateA = a.rigdaydate || a.eventdate || a.rigdowndate || '';
    const dateB = b.rigdaydate || b.eventdate || b.rigdowndate || '';
    return dateA.localeCompare(dateB);
  };

  scheduled.sort(sortByDate);
  memberOnly.sort(sortByDate);

  const renderBooking = (booking: MobileBooking, dimmed: boolean) => {
    // Show the first relevant date
    const dateStr = booking.rigdaydate || booking.eventdate || booking.rigdowndate;
    const badge = dateStr ? eventTypeBadge(booking, dateStr) : null;

    return (
      <button
        key={booking.id}
        onClick={() => navigate(`/m/job/${booking.id}`)}
        className={cn(
          "w-full text-left rounded-2xl border bg-card p-3.5 transition-all duration-150 active:scale-[0.98]",
          dimmed
            ? "border-border/40 shadow-sm opacity-50"
            : "border-primary/20 shadow-md",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {dimmed ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-muted text-muted-foreground border-border">
                  I PROJEKTET
                </span>
              ) : badge ? (
                <span className={cn("px-1.5 py-0.5 rounded text-[10px] tracking-wide font-bold border", badge.className)}>
                  {badge.label}
                </span>
              ) : null}
              {dimmed ? null : (
                <span className="px-1.5 py-0.5 rounded text-[10px] tracking-wide font-bold border bg-primary/10 text-primary border-primary/20">
                  SCHEMALAGD
                </span>
              )}
              {booking.booking_number && (
                <span className="text-[11px] font-mono text-muted-foreground/50">
                  #{booking.booking_number}
                </span>
              )}
            </div>
            <h3 className="font-bold text-foreground text-[15px] leading-snug mb-0.5">
              {booking.client}
            </h3>
            {dateStr && (
              <p className="text-xs text-muted-foreground mb-0.5">
                {format(parseISO(dateStr), 'd MMM yyyy', { locale: sv })}
              </p>
            )}
            {booking.deliveryaddress && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/40" />
                <span className="truncate">{booking.deliveryaddress}</span>
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/30 mt-1 shrink-0" />
        </div>
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileBackHeader title={projectName} />

      <div className="flex-1 px-4 py-4 space-y-5">
        {/* Summary */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{projectName}</h2>
            <p className="text-xs text-muted-foreground">
              {projectBookings.length} bokningar · {scheduled.length} schemalagda för dig
            </p>
          </div>
        </div>

        {/* Scheduled bookings — full color */}
        {scheduled.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary mb-2 px-1">
              Dina schemalagda
            </h3>
            <div className="space-y-2">
              {scheduled.map(b => renderBooking(b, false))}
            </div>
          </div>
        )}

        {/* Project member bookings — dimmed */}
        {memberOnly.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
              Övriga i projektet
            </h3>
            <div className="space-y-2">
              {memberOnly.map(b => renderBooking(b, true))}
            </div>
          </div>
        )}

        {projectBookings.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Inga bokningar hittades i detta projekt.
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileProjectDetail;
