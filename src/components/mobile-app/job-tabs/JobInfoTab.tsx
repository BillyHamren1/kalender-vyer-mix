import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar, Clock, FileText, StickyNote } from 'lucide-react';

interface JobInfoTabProps {
  booking: any;
}

const InfoRow = ({ label, value, icon: Icon }: { label: string; value: string | null; icon?: any }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
};

const TimeBlock = ({ label, date, start, end }: { label: string; date: string | null; start: string | null; end: string | null }) => {
  if (!date) return null;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium">
        {format(parseISO(date), 'd MMM yyyy', { locale: sv })}
      </p>
      {(start || end) && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {start?.slice(0, 5) || '—'} – {end?.slice(0, 5) || '—'}
        </p>
      )}
    </div>
  );
};

const JobInfoTab = ({ booking }: JobInfoTabProps) => {
  return (
    <div className="space-y-4">
      {/* Dates */}
      <div className="grid grid-cols-3 gap-2">
        <TimeBlock label="Rigg" date={booking.rigdaydate} start={booking.rig_start_time} end={booking.rig_end_time} />
        <TimeBlock label="Event" date={booking.eventdate} start={booking.event_start_time} end={booking.event_end_time} />
        <TimeBlock label="Riv" date={booking.rigdowndate} start={booking.rigdown_start_time} end={booking.rigdown_end_time} />
      </div>

      {/* Address */}
      {booking.deliveryaddress && (
        <div className="rounded-xl border bg-card p-3">
          <InfoRow label="Leveransadress" value={booking.deliveryaddress} icon={Calendar} />
          {(booking.delivery_postal_code || booking.delivery_city) && (
            <p className="text-xs text-muted-foreground pl-7">
              {[booking.delivery_postal_code, booking.delivery_city].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      )}

      {/* Project info */}
      {booking.assigned_project_name && (
        <div className="rounded-xl border bg-card p-3">
          <InfoRow label="Projekt" value={booking.assigned_project_name} icon={FileText} />
        </div>
      )}

      {/* Internal notes */}
      {booking.internalnotes && (
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-start gap-3">
            <StickyNote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Interna anteckningar</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{booking.internalnotes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Products */}
      {booking.products && booking.products.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Produkter</p>
          <div className="space-y-1">
            {booking.products.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0 border-border/50">
                <span className="text-foreground">{p.description || p.name}</span>
                {p.quantity && <span className="text-muted-foreground text-xs">{p.quantity} st</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobInfoTab;
