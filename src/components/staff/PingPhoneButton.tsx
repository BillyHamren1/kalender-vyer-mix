import React, { useState } from 'react';
import { Send, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  staffId: string;
  staffName?: string;
  className?: string;
}

/**
 * Admin-only "Pinga telefon"-knapp.
 *
 * Anropar edge-funktionen `request-location-ping` som skickar en silent
 * FCM data-push till medarbetarens enhet. Mobilappens
 * `locationPingHandler` fångar pushen, tar en färsk GPS-sample och
 * lägger den i `staff_locations` via sync-kön. Bra för "Tappad signal"-
 * fall där appen ligger i bakgrunden.
 */
export const PingPhoneButton: React.FC<Props> = ({ staffId, staffName, className }) => {
  const [state, setState] = useState<'idle' | 'pending' | 'sent'>('idle');

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'pending') return;
    setState('pending');
    try {
      const { data, error } = await supabase.functions.invoke('request-location-ping', {
        body: { staff_ids: [staffId], reason: 'admin_manual_request' },
      });
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      if (sent > 0) {
        setState('sent');
        toast.success(`Ping skickad till ${staffName || 'medarbetaren'}`);
        setTimeout(() => setState('idle'), 4000);
      } else {
        setState('idle');
        toast.warning('Ingen aktiv enhet att pinga (saknar device-token)');
      }
    } catch (err: any) {
      setState('idle');
      toast.error(`Kunde inte skicka ping: ${err.message ?? 'okänt fel'}`);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={state === 'pending'}
      className={`h-7 px-2 text-[11px] gap-1 ${className || ''}`}
      title="Skicka GPS-ping till medarbetarens telefon"
    >
      {state === 'pending' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === 'sent' ? (
        <Check className="h-3 w-3" />
      ) : (
        <Send className="h-3 w-3" />
      )}
      {state === 'sent' ? 'Skickad' : 'Pinga'}
    </Button>
  );
};
