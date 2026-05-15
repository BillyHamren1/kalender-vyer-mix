import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { MapPin, Phone, Mail, User, Package, Paperclip, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { isPhaseLocked, pickBookingTime } from './bookingPlacementSeed';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  booking: any;
}

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '–';
  try {
    return format(parseISO(s), 'EEE d MMM yyyy', { locale: sv });
  } catch {
    return s;
  }
};

export const BookingInfoHeader: React.FC<Props> = ({ booking }) => {
  const bookingId = booking?.id;

  const { data: products } = useQuery({
    queryKey: ['placement-info-products', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_products')
        .select('id, name, quantity')
        .eq('booking_id', bookingId)
        .order('name', { ascending: true });
      return (data || []) as Array<{ id: string; name: string; quantity: number }>;
    },
  });

  const { data: attachments } = useQuery({
    queryKey: ['placement-info-attachments', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_attachments')
        .select('id, file_name, url')
        .eq('booking_id', bookingId);
      return (data || []) as Array<{ id: string; file_name: string | null; url: string }>;
    },
  });

  if (!booking) return null;

  const phaseRow = (
    label: string,
    date: string | null,
    kind: 'rig' | 'event' | 'rigDown',
  ) => {
    const locked = isPhaseLocked(booking, kind);
    const start = pickBookingTime(booking, kind, 'start');
    const end = pickBookingTime(booking, kind, 'end');
    if (!date) return null;
    return (
      <div className="flex items-center justify-between gap-2 text-xs py-0.5">
        <span className="font-medium w-20 shrink-0">{label}</span>
        <span className="text-muted-foreground flex-1 truncate">
          {fmtDate(date)} · {start}–{end}
        </span>
        {locked && (
          <Badge variant="outline" className="h-4 px-1 text-[9px] border-red-400 text-red-700 bg-red-50">
            Fast tid
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{booking.client || 'Okänd kund'}</span>
          {booking.booking_number && (
            <span className="text-[10px] font-mono text-muted-foreground">
              #{booking.booking_number}
            </span>
          )}
        </div>
        {booking.deliveryaddress && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{booking.deliveryaddress}</span>
          </div>
        )}
      </div>

      {(booking.contact_name || booking.contact_phone || booking.contact_email) && (
        <div className="space-y-0.5">
          {booking.contact_name && (
            <div className="flex items-center gap-1 text-xs">
              <User className="h-3 w-3 text-muted-foreground" />
              {booking.contact_name}
            </div>
          )}
          {booking.contact_phone && (
            <div className="flex items-center gap-1 text-xs">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <a href={`tel:${booking.contact_phone}`} className="hover:underline">
                {booking.contact_phone}
              </a>
            </div>
          )}
          {booking.contact_email && (
            <div className="flex items-center gap-1 text-xs">
              <Mail className="h-3 w-3 text-muted-foreground" />
              <a href={`mailto:${booking.contact_email}`} className="hover:underline">
                {booking.contact_email}
              </a>
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-border/40 bg-card p-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          Tider från bokning
        </div>
        {phaseRow('Riggning', booking.rigdaydate, 'rig')}
        {phaseRow('Event', booking.eventdate, 'event')}
        {phaseRow('Demont.', booking.rigdowndate, 'rigDown')}
      </div>

      {(products && products.length > 0) && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary w-full">
            <Package className="h-3 w-3" />
            Produkter ({products.length})
            <ChevronDown className="h-3 w-3 ml-auto" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 max-h-32 overflow-y-auto rounded border border-border/40 bg-card p-1.5 space-y-0.5">
            {products.map((p) => (
              <div key={p.id} className="flex justify-between text-[11px] gap-2">
                <span className="truncate">{p.name}</span>
                <span className="text-muted-foreground shrink-0">{p.quantity} st</span>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {(attachments && attachments.length > 0) && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary w-full">
            <Paperclip className="h-3 w-3" />
            Bilagor ({attachments.length})
            <ChevronDown className="h-3 w-3 ml-auto" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 rounded border border-border/40 bg-card p-1.5 space-y-0.5">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-primary hover:underline truncate"
              >
                <FileText className="h-3 w-3 shrink-0" />
                {a.file_name || a.url}
              </a>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {booking.internalnotes && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium hover:text-primary w-full">
            <FileText className="h-3 w-3" />
            Anteckningar
            <ChevronDown className="h-3 w-3 ml-auto" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 rounded border border-border/40 bg-card p-1.5 text-[11px] whitespace-pre-wrap">
            {booking.internalnotes}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
