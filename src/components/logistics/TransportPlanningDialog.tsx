import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { syncBookingOperationalPlan } from '@/services/bookingOperationalPlanSyncService';

const DEFAULT_ORIGIN = 'David Adrians Väg, 194 91 Upplands Väsby, Sweden';

type PlanningStatus = 'preliminary' | 'confirmed';
type TransportType = 'delivery' | 'pickup' | 'transfer' | 'internal' | 'other';

interface Props {
  bookingId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string | null;
  defaultStartTime?: string | null;
  onSaved?: () => void | Promise<void>;
}

export default function TransportPlanningDialog({ bookingId, open, onOpenChange, defaultDate, defaultStartTime, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState<any>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [planningStatus, setPlanningStatus] = useState<PlanningStatus>('preliminary');
  const [transportType, setTransportType] = useState<TransportType>('delivery');
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState('');
  const [vehicleId, setVehicleId] = useState('unassigned');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open || !bookingId) return;
    let alive = true;
    void (async () => {
      const [{ data: b, error: bookingError }, { data: vehicleRows }] = await Promise.all([
        supabase.from('bookings').select('id, client, booking_number, deliveryaddress, delivery_city, rigdaydate, eventdate, rigdowndate').eq('id', bookingId).single(),
        supabase.from('vehicles').select('id, name, registration_number, is_external, vehicle_type').eq('is_active', true).order('name'),
      ]);
      if (!alive) return;
      if (bookingError) {
        toast.error('Kunde inte hämta bokningen');
        return;
      }
      setBooking(b);
      setVehicles(vehicleRows || []);
      setDate(defaultDate || b.rigdaydate || b.eventdate || format(new Date(), 'yyyy-MM-dd'));
      setStartTime(defaultStartTime?.slice(0, 5) || '08:00');
      setEndTime('09:00');
      setPlanningStatus('preliminary');
      setTransportType('delivery');
      setOrigin(DEFAULT_ORIGIN);
      setDestination([b.deliveryaddress, b.delivery_city].filter(Boolean).join(', '));
      setVehicleId('unassigned');
      setNotes('');
    })();
    return () => { alive = false; };
  }, [open, bookingId, defaultDate, defaultStartTime]);

  const title = useMemo(() => {
    if (!booking) return 'Planera transport';
    return `Planera transport · ${booking.booking_number || booking.client}`;
  }, [booking]);

  const save = async () => {
    if (!bookingId || !date || !startTime) {
      toast.error('Datum och starttid krävs');
      return;
    }
    if (endTime && endTime <= startTime) {
      toast.error('Sluttid måste vara efter starttid');
      return;
    }
    setSaving(true);
    try {
      const duration = endTime
        ? Math.max(0, (Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5))) - (Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5))))
        : null;
      const payload: any = {
        booking_id: bookingId,
        vehicle_id: vehicleId === 'unassigned' ? null : vehicleId,
        transport_date: date,
        transport_time: startTime,
        transport_end_time: endTime || null,
        estimated_duration: duration,
        planning_status: planningStatus,
        transport_type: transportType,
        origin_address: origin || null,
        destination_address: destination || null,
        pickup_address: origin || null,
        driver_notes: notes || null,
        status: 'pending',
        stop_order: 0,
      };
      const { error } = await supabase.from('transport_assignments').insert(payload);
      if (error) throw error;
      await syncBookingOperationalPlan(bookingId);
      toast.success(planningStatus === 'confirmed' ? 'Transport bekräftad och planerad' : 'Preliminär transport planerad');
      await onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('[TransportPlanningDialog] save failed', error);
      toast.error(error?.message || 'Kunde inte spara transporten');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />{title}</DialogTitle>
          <DialogDescription>Skapa en operativ transporthändelse. Fordon kan väljas senare.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Datum</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Slut</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Status</Label><Select value={planningStatus} onValueChange={v => setPlanningStatus(v as PlanningStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="preliminary">Preliminär</SelectItem><SelectItem value="confirmed">Bekräftad</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Typ</Label><Select value={transportType} onValueChange={v => setTransportType(v as TransportType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="delivery">Leverans</SelectItem><SelectItem value="pickup">Hämtning</SelectItem><SelectItem value="transfer">Mellantransport</SelectItem><SelectItem value="internal">Intern</SelectItem><SelectItem value="other">Annan</SelectItem></SelectContent></Select></div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Från</Label><Input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Lager / adress" /></div>
            <div className="space-y-1.5"><Label>Till</Label><Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Leveransadress" /></div>
          </div>

          <div className="space-y-1.5"><Label>Fordon</Label><Select value={vehicleId} onValueChange={setVehicleId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Ej bestämt</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}{v.registration_number ? ` · ${v.registration_number}` : ''}{v.is_external ? ' · extern' : ''}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Anteckning</Label><Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Valfri information till transportplaneringen" /></div>
        </div>

        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Avbryt</Button><Button onClick={save} disabled={saving || !bookingId}>{saving ? 'Sparar…' : 'Spara transport'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
