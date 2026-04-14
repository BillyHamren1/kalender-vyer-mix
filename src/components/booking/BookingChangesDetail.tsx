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

// Time fields that store HH:mm or ISO datetime but represent a time-of-day
const TIME_FIELDS = new Set([
  'rig_start_time', 'rig_end_time',
  'event_start_time', 'event_end_time',
  'rigdown_start_time', 'rigdown_end_time',
]);

function formatValue(value: unknown, fieldName?: string): string {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  if (typeof value === 'string') {
    // Pure date: 2026-04-29
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      try {
        return format(new Date(value), 'd MMM yyyy', { locale: sv });
      } catch { /* fall through */ }
    }
    // ISO datetime: 2026-04-29T07:00:00...
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      try {
        const d = new Date(value);
        // If this is a time field, show only HH:mm
        if (fieldName && TIME_FIELDS.has(fieldName)) {
          return format(d, 'HH:mm');
        }
        return format(d, 'd MMM yyyy HH:mm', { locale: sv });
      } catch { /* fall through */ }
    }
    // HH:mm time string
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
      return value.slice(0, 5);
    }
    return value || '–';
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

  // Filter out internal fields
  const internalFields = new Set(['assigned_to_project', 'assigned_project_id', 'assigned_project_name', 'viewed']);
  const displayFields = Object.keys(changedFields).filter(f => changedFields[f] && !internalFields.has(f));

  if (displayFields.length === 0) {
    return <div className="text-xs text-muted-foreground p-2">Inga synliga ändringar</div>;
  }

  return (
    <div className="space-y-1.5 p-2">
      <div className="text-[10px] text-muted-foreground/60 mb-1">
        Ändrad {format(new Date(change.changed_at), 'd MMM HH:mm', { locale: sv })}
      </div>
      {displayFields.map(field => (
        <div key={field} className="flex items-start gap-2 text-xs rounded-lg bg-muted/30 px-2.5 py-1.5">
          <span className="font-medium text-foreground shrink-0 min-w-[100px]">
            {FIELD_LABELS[field] || field}
          </span>
          <span className="text-muted-foreground truncate max-w-[120px]" title={formatValue(previousValues[field])}>
            {formatValue(previousValues[field])}
          </span>
          <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />
          <span className="text-primary font-medium truncate max-w-[120px]" title={formatValue(newValues[field])}>
            {formatValue(newValues[field])}
          </span>
        </div>
      ))}
    </div>
  );
};

export default BookingChangesDetail;
