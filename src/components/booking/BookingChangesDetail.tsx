import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ArrowRight } from 'lucide-react';

const FIELD_LABELS: Record<string, string> = {
  client: 'Kund',
  eventdate: 'Eventdatum',
  rigdaydate: 'Riggdatum',
  rigdowndate: 'Nedriggdatum',
  rig_start_time: 'Riggtid start',
  rig_end_time: 'Riggtid slut',
  event_start_time: 'Eventtid start',
  event_end_time: 'Eventtid slut',
  rigdown_start_time: 'Nedriggtid start',
  rigdown_end_time: 'Nedriggtid slut',
  deliveryaddress: 'Leveransadress',
  delivery_city: 'Stad',
  delivery_postal_code: 'Postnummer',
  internalnotes: 'Interna anteckningar',
  status: 'Status',
  carry_more_than_10m: 'Bär mer än 10m',
  ground_nails_allowed: 'Markpinnar tillåtet',
  exact_time_needed: 'Exakt tid behövs',
  exact_time_info: 'Exakt tid info',
  location: 'GPS-position',
  contact_name: 'Kontaktperson',
  contact_phone: 'Kontakttelefon',
  contact_email: 'Kontaktemail',
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  new: 'Ny bokning skapad',
  update: 'Bokning uppdaterad',
  status_change: 'Status ändrad',
};

const TIME_FIELDS = new Set([
  'rig_start_time', 'rig_end_time',
  'event_start_time', 'event_end_time',
  'rigdown_start_time', 'rigdown_end_time',
]);

function formatValue(value: unknown, fieldName?: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try { return format(new Date(value), 'd MMM yyyy', { locale: sv }); } catch { /* fall through */ }
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      try {
        const d = new Date(value);
        if (fieldName && TIME_FIELDS.has(fieldName)) return format(d, 'HH:mm');
        return format(d, 'd MMM yyyy HH:mm', { locale: sv });
      } catch { /* fall through */ }
    }
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
    return value || null;
  }
  return String(value);
}

interface BookingChangesDetailProps {
  bookingId: string;
}

const BookingChangesDetail: React.FC<BookingChangesDetailProps> = ({ bookingId }) => {
  const { data: change, isLoading } = useQuery({
    queryKey: ['booking-latest-change', bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_changes')
        .select('change_type, changed_fields, previous_values, new_values, changed_at')
        .eq('booking_id', bookingId)
        .order('changed_at', { ascending: false })
        .limit(1)
        .single();
      if (error) return null;
      return data;
    },
  });

  if (isLoading) return <div className="text-xs text-muted-foreground p-2">Laddar...</div>;
  if (!change) return <div className="text-xs text-muted-foreground p-2">Inga ändringar hittade</div>;

  const changedFields = change.changed_fields as Record<string, boolean>;
  const previousValues = (change.previous_values || {}) as Record<string, unknown>;
  const newValues = (change.new_values || {}) as Record<string, unknown>;
  const isNew = change.change_type === 'new';

  const internalFields = new Set(['assigned_to_project', 'assigned_project_id', 'assigned_project_name', 'viewed']);
  const displayFields = Object.keys(changedFields).filter(f => changedFields[f] && !internalFields.has(f));

  if (displayFields.length === 0) {
    return <div className="text-xs text-muted-foreground p-2">Inga synliga ändringar</div>;
  }

  const changeLabel = CHANGE_TYPE_LABELS[change.change_type] || 'Ändring';

  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">{changeLabel}</span>
        <span className="text-[10px] text-muted-foreground/60">
          {format(new Date(change.changed_at), 'd MMM HH:mm', { locale: sv })}
        </span>
      </div>

      <div className="space-y-1">
        {displayFields.map(field => {
          const prev = formatValue(previousValues[field], field);
          const next = formatValue(newValues[field], field);
          const hasPrev = prev !== null;

          return (
            <div key={field} className="rounded-lg bg-muted/30 px-2.5 py-1.5">
              <div className="text-[10px] font-medium text-muted-foreground mb-0.5">
                {FIELD_LABELS[field] || field}
              </div>
              {isNew || !hasPrev ? (
                <div className="text-xs">
                  <span className="text-muted-foreground/50 mr-1">Satt till:</span>
                  <span className="text-primary font-medium">{next ?? '–'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground/60">Från:</span>
                  <span className="text-muted-foreground">{prev}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  <span className="text-muted-foreground/60">Till:</span>
                  <span className="text-primary font-medium">{next ?? '–'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BookingChangesDetail;
