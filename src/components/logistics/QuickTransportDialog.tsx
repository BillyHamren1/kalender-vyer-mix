import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, MapPin, Save, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { BookingForTransport } from '@/hooks/useBookingsForTransport';
import type { TransportAssignment } from '@/hooks/useTransportAssignments';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import type { Vehicle } from '@/hooks/useVehicles';

const DEFAULT_PICKUP_ADDRESS = 'David Adrians Väg, 194 91 Upplands Väsby, Sweden';

const vehicleTypeLabels: Record<string, string> = {
  van: 'Skåpbil',
  light_truck: 'Lätt lastbil',
  pickup_crane: 'C-pickis med kran',
  crane_15m: 'Kranbil 15 m',
  crane_jib_20m: 'Kranbil med jibb 20 m',
  body_truck: 'Bodbil',
  truck: 'Lastbil',
  trailer: 'Släp',
  trailer_13m: 'Trailer 13 m',
  truck_trailer: 'Lastbil med släp',
  crane_trailer: 'Kranbil med släp',
  other: 'Övrigt',
};

interface QuickTransportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookings: BookingForTransport[];
  vehicles: Vehicle[];
  assignment?: TransportAssignment | null;
  defaultBookingId?: string | null;
  defaultDate?: string | null;
  onSaved?: () => void | Promise<void>;
}

const QuickTransportDialog: React.FC<QuickTransportDialogProps> = ({
  open,
  onOpenChange,
  bookings,
  vehicles,
  assignment,
  defaultBookingId,
  defaultDate,
  onSaved,
}) => {
  const { assignBookingToVehicle, updateAssignment } = useTransportAssignments();
  const activeVehicles = useMemo(() => vehicles.filter((v) => v.is_active), [vehicles]);

  const [bookingId, setBookingId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [transportDate, setTransportDate] = useState('');
  const [transportTime, setTransportTime] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [pickupAddress, setPickupAddress] = useState(DEFAULT_PICKUP_ADDRESS);
  const [driverNotes, setDriverNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedBooking = bookings.find((b) => b.id === bookingId);
  const selectedVehicle = activeVehicles.find((v) => v.id === vehicleId);
  const isEditing = Boolean(assignment?.id);

  useEffect(() => {
    if (!open) return;

    if (assignment) {
      setBookingId(assignment.booking_id);
      setVehicleId(assignment.vehicle_id);
      setTransportDate(assignment.transport_date || '');
      setTransportTime(assignment.transport_time?.slice(0, 5) || '');
      setEstimatedDuration(assignment.estimated_duration ? String(assignment.estimated_duration) : '');
      setPickupAddress(assignment.pickup_address || DEFAULT_PICKUP_ADDRESS);
      setDriverNotes(assignment.driver_notes || '');
      return;
    }

    const initialBookingId = defaultBookingId || '';
    const initialBooking = bookings.find((b) => b.id === initialBookingId);
    setBookingId(initialBookingId);
    setVehicleId('');
    setTransportDate(
      defaultDate ||
      initialBooking?.rigdaydate ||
      initialBooking?.eventdate ||
      new Date().toISOString().slice(0, 10)
    );
    setTransportTime('');
    setEstimatedDuration('');
    setPickupAddress(DEFAULT_PICKUP_ADDRESS);
    setDriverNotes('');
  }, [open, assignment, defaultBookingId, defaultDate, bookings]);

  useEffect(() => {
    if (!open || isEditing || !selectedBooking || defaultDate) return;
    setTransportDate((current) => current || selectedBooking.rigdaydate || selectedBooking.eventdate || new Date().toISOString().slice(0, 10));
  }, [open, isEditing, selectedBooking, defaultDate]);

  const handleSave = async () => {
    if (!bookingId) {
      toast.error('Välj bokning');
      return;
    }
    if (!vehicleId) {
      toast.error('Välj fordon eller transportpartner');
      return;
    }
    if (!transportDate) {
      toast.error('Ange transportdatum');
      return;
    }
    if (!transportTime) {
      toast.error('Ange avgångstid');
      return;
    }

    const duration = estimatedDuration.trim() ? Number(estimatedDuration) : undefined;
    if (duration !== undefined && (!Number.isFinite(duration) || duration < 0)) {
      toast.error('Uppskattad tid måste anges i minuter');
      return;
    }

    setSaving(true);
    try {
      let ok = false;
      if (assignment?.id) {
        ok = await updateAssignment(assignment.id, {
          vehicle_id: vehicleId,
          booking_id: bookingId,
          transport_date: transportDate,
          transport_time: transportTime,
          estimated_duration: duration ?? null,
          pickup_address: pickupAddress.trim() || null,
          driver_notes: driverNotes.trim() || null,
        });
      } else {
        const created = await assignBookingToVehicle({
          vehicle_id: vehicleId,
          booking_id: bookingId,
          transport_date: transportDate,
          transport_time: transportTime,
          estimated_duration: duration,
          pickup_address: pickupAddress.trim() || undefined,
          driver_notes: driverNotes.trim() || undefined,
        });
        ok = Boolean(created);
      }

      if (!ok) return;
      toast.success(isEditing ? 'Transporten är uppdaterad' : 'Transporten är registrerad');
      await onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/20 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border bg-background p-2.5 shadow-sm">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{isEditing ? 'Redigera bokad transport' : 'Registrera bokad transport'}</DialogTitle>
              <DialogDescription className="mt-1">
                Lägg in den operativa informationen snabbt. Samma uppgifter visas automatiskt i Bemanningsplaneringen på rätt bokning och dag.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Bokning</Label>
              <Select value={bookingId} onValueChange={setBookingId} disabled={isEditing}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Välj bokning" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {bookings.map((booking) => (
                    <SelectItem key={booking.id} value={booking.id}>
                      {booking.booking_number ? `#${booking.booking_number} · ` : ''}{booking.client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBooking && (
                <p className="text-xs text-muted-foreground">
                  Leverans: {selectedBooking.deliveryaddress || 'adress saknas'}{selectedBooking.delivery_city ? `, ${selectedBooking.delivery_city}` : ''}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Fordon / transportpartner</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Välj eget fordon eller bokad partner" />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {activeVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.is_external ? 'Partner · ' : 'Eget · '}{vehicle.name}
                      {vehicle.vehicle_type ? ` · ${vehicleTypeLabels[vehicle.vehicle_type] || vehicle.vehicle_type}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVehicle && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{selectedVehicle.is_external ? 'Extern transportpartner' : 'Eget fordon'}</span>
                  {selectedVehicle.registration_number && <span>• {selectedVehicle.registration_number}</span>}
                  {selectedVehicle.contact_phone && <span>• {selectedVehicle.contact_phone}</span>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-transport-date">Datum</Label>
              <div className="relative">
                <Input id="quick-transport-date" type="date" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} className="h-11 pr-10" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-transport-time">Avgångstid</Label>
              <div className="relative">
                <Clock3 className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input id="quick-transport-time" type="time" value={transportTime} onChange={(e) => setTransportTime(e.target.value)} className="h-11 pl-9" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-transport-duration">Uppskattad transporttid</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="quick-transport-duration"
                  inputMode="numeric"
                  type="number"
                  min="0"
                  step="15"
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value)}
                  placeholder="T.ex. 90"
                  className="h-11"
                />
                <span className="shrink-0 text-sm text-muted-foreground">min</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex h-11 items-center rounded-md border bg-muted/20 px-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="ml-2 font-medium">Planerad</span>
                <span className="ml-2 text-xs text-muted-foreground">ändras i transportflödet</span>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="quick-transport-pickup">Upphämtning</Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input id="quick-transport-pickup" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} className="h-11 pl-9" />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="quick-transport-notes">Transportinfo / instruktion</Label>
              <Textarea
                id="quick-transport-notes"
                value={driverNotes}
                onChange={(e) => setDriverNotes(e.target.value)}
                placeholder="T.ex. ring platschef 30 min före, bakgavellyft krävs, infart via lastkaj..."
                className="min-h-[92px] resize-y"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Avbryt</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Sparar…' : isEditing ? 'Spara ändringar' : 'Spara transport'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickTransportDialog;
