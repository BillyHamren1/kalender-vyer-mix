import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Package, Truck, Check, ChevronRight, ChevronLeft,
  MapPin, Calendar, ClipboardList, X, Clock, Building2,
  RotateCcw, MessageSquare, Mail, Send, Weight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PremiumCard } from '@/components/ui/PremiumCard';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVehicles, Vehicle } from '@/hooks/useVehicles';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { AddressAutocomplete } from '@/components/logistics/AddressAutocomplete';
import { AddressFavorites } from '@/components/logistics/AddressFavorites';
import { cn } from '@/lib/utils';

const vehicleTypeLabels: Record<string, string> = {
  van: 'Skåpbil',
  light_truck: 'Lätt lastbil',
  pickup_crane: 'C-pickis med kran',
  crane_15m: 'Kranbil 15m kran',
  crane_jib_20m: 'Kranbil m jibb 20m',
  body_truck: 'Bodbil',
  truck: 'Lastbil',
  trailer: 'Släp',
  trailer_13m: 'Trailer (13m)',
  truck_trailer: 'Lastbil med släp',
  crane_trailer: 'Kranbil med släp',
  other: 'Övrigt',
};

const DEFAULT_PICKUP_ADDRESS = 'David Adrians Väg, 194 91 Upplands Väsby, Sweden';
const DEFAULT_PICKUP_LATITUDE = 59.4891;
const DEFAULT_PICKUP_LONGITUDE = 17.8549;

interface BookingData {
  id: string;
  client: string;
  booking_number: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  products: { id: string; name: string; quantity: number; estimated_weight_kg: number | null; estimated_volume_m3: number | null }[];
}

interface WizardData {
  transportMode: 'own' | 'partner';
  vehicleType: string;
  transportDate: string;
  transportTime: string;
  pickupAddress: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  vehicleId: string;
  stopOrder: number;
  estimatedDuration: string;
  includeReturn: boolean;
  returnDate: string;
  returnTime: string;
  returnPickupAddress: string;
  returnContactName: string;
  returnContactPhone: string;
  returnContactEmail: string;
  returnEstimatedDuration: string;
  driverNotes: string;
}

interface ProjectTransportBookingDialogProps {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const ProjectTransportBookingDialog: React.FC<ProjectTransportBookingDialogProps> = ({
  bookingId, open, onOpenChange, onComplete,
}) => {
  const { vehicles } = useVehicles();
  const { assignBookingToVehicle, updateAssignment } = useTransportAssignments();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState<Partial<WizardData>>({});

  // Email dialog
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailReferencePerson, setEmailReferencePerson] = useState('');
  const [pendingAssignmentIds, setPendingAssignmentIds] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  const activeVehicles = vehicles.filter(v => v.is_active);
  const internalVehicles = activeVehicles.filter(v => !v.is_external);
  const externalPartners = activeVehicles.filter(v => v.is_external);

  const selectedPartner = wizardData.vehicleId
    ? externalPartners.find(v => v.id === wizardData.vehicleId)
    : null;

  const matchingOwnVehicles = wizardData.vehicleType
    ? internalVehicles.filter(v => v.vehicle_type === wizardData.vehicleType)
    : [];

  const totalSteps = wizardData.transportMode === 'partner' ? 4 : 3;
  const stepLabels = wizardData.transportMode === 'partner'
    ? ['Välj partner', 'Välj fordon', 'Datum & Detaljer', 'Bekräfta']
    : ['Fordon', 'Datum & Detaljer', 'Bekräfta'];

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 6; h <= 23; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  // Fetch booking data when dialog opens
  useEffect(() => {
    if (!open || !bookingId) return;
    const fetchBooking = async () => {
      setLoading(true);
      try {
        const { data: b, error } = await supabase
          .from('bookings')
          .select('id, client, booking_number, deliveryaddress, delivery_city, delivery_postal_code, delivery_latitude, delivery_longitude, contact_name, contact_phone, contact_email, rigdaydate, eventdate, rigdowndate')
          .eq('id', bookingId)
          .single();
        if (error) throw error;

        const { data: products } = await supabase
          .from('booking_products')
          .select('id, name, quantity, estimated_weight_kg, estimated_volume_m3')
          .eq('booking_id', bookingId)
          .is('parent_product_id', null);

        setBooking({ ...b, products: products || [] });
        setWizardStep(1);
        setWizardData({
          transportDate: b.rigdaydate || b.eventdate || format(new Date(), 'yyyy-MM-dd'),
          transportTime: '',
          pickupAddress: DEFAULT_PICKUP_ADDRESS,
          pickupLatitude: DEFAULT_PICKUP_LATITUDE,
          pickupLongitude: DEFAULT_PICKUP_LONGITUDE,
          includeReturn: false,
          returnDate: b.rigdowndate || '',
          returnTime: '',
          returnPickupAddress: DEFAULT_PICKUP_ADDRESS,
          returnContactName: '',
          returnContactPhone: '',
          returnContactEmail: '',
          driverNotes: '',
        });
      } catch (e) {
        console.error('Error fetching booking:', e);
        toast.error('Kunde inte hämta bokningsdata');
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [open, bookingId]);

  const closeDialog = () => {
    onOpenChange(false);
    setWizardStep(1);
    setWizardData({});
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(new Date(d), 'd MMM', { locale: sv }); } catch { return d; }
  };

  const handleSubmitWizard = async () => {
    if (!wizardData.vehicleId || !wizardData.transportDate || !booking) return;

    const result = await assignBookingToVehicle({
      vehicle_id: wizardData.vehicleId,
      booking_id: booking.id,
      transport_date: wizardData.transportDate,
      transport_time: wizardData.transportTime || undefined,
      pickup_address: wizardData.pickupAddress || undefined,
      pickup_latitude: wizardData.pickupLatitude,
      pickup_longitude: wizardData.pickupLongitude,
      stop_order: wizardData.stopOrder || 0,
      driver_notes: wizardData.driverNotes || undefined,
      estimated_duration: wizardData.estimatedDuration ? Math.round(Number(wizardData.estimatedDuration) * 60) : undefined,
    });

    let returnResult: any = null;
    if (result && wizardData.includeReturn) {
      if (!wizardData.returnDate || !wizardData.returnTime) {
        toast.error('Returdatum och tid krävs');
        closeDialog();
        onComplete();
        return;
      }
      returnResult = await assignBookingToVehicle({
        vehicle_id: wizardData.vehicleId,
        booking_id: booking.id,
        transport_date: wizardData.returnDate,
        transport_time: wizardData.returnTime,
        pickup_address: wizardData.returnPickupAddress || DEFAULT_PICKUP_ADDRESS,
        stop_order: (wizardData.stopOrder || 0) + 1,
        driver_notes: wizardData.returnContactName
          ? `Returkontakt: ${wizardData.returnContactName}, Tel: ${wizardData.returnContactPhone}${wizardData.returnContactEmail ? ', E-post: ' + wizardData.returnContactEmail : ''}`
          : undefined,
      });
    }

    if (result) {
      if (wizardData.transportMode === 'partner' && result.id) {
        const allIds = [result.id];
        if (returnResult?.id) allIds.push(returnResult.id);
        const defaultSubject = allIds.length > 1
          ? `Transportförfrågan: ${booking.client} — ${allIds.length} körningar`
          : `Transportförfrågan: ${booking.client} — ${wizardData.transportDate}`;
        const partnerName = selectedPartner?.contact_person || selectedPartner?.name || 'partner';
        const defaultMessage = allIds.length > 1
          ? `Hej ${partnerName},\n\nVi har ${allIds.length} nya transportförfrågningar som vi gärna vill att ni utför. Se detaljer i mejlet.\n\nMed vänliga hälsningar,\nFrans August Logistik`
          : `Hej ${partnerName},\n\nVi har en ny transportförfrågan som vi gärna vill att ni utför. Se detaljer i mejlet.\n\nMed vänliga hälsningar,\nFrans August Logistik`;

        setPendingAssignmentIds(allIds);
        setEmailSubject(defaultSubject);
        setEmailMessage(defaultMessage);
        setEmailReferencePerson('');
        setEmailDialogOpen(true);
        onComplete();
        return;
      }

      closeDialog();
      onComplete();
    }
  };

  const handleSendEmail = async () => {
    if (pendingAssignmentIds.length === 0) return;
    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-transport-request', {
        body: {
          assignment_ids: pendingAssignmentIds,
          custom_subject: emailSubject || undefined,
          custom_message: emailMessage || undefined,
          reference_person: emailReferencePerson || undefined,
        },
      });
      if (error) {
        toast.error('Mejl kunde inte skickas till partnern');
      } else {
        toast.success(`Transportförfrågan skickad till ${data?.sent_to || 'partnern'}`);
      }
    } catch {
      toast.error('Mejlutskick misslyckades');
    } finally {
      setSendingEmail(false);
      setEmailDialogOpen(false);
      setPendingAssignmentIds([]);
      closeDialog();
      onComplete();
    }
  };

  const handleCancelEmail = () => {
    setEmailDialogOpen(false);
    setPendingAssignmentIds([]);
    closeDialog();
    toast.info('Transport bokad — inget mejl skickades');
    onComplete();
  };

  if (!open) return null;

  return (
    <>
      {/* Main wizard dialog */}
      <Dialog open={open && !emailDialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] p-0 bg-card flex flex-col [&>button]:hidden overflow-y-auto">
          <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto w-full">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="h-10 w-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : booking ? (
              <PremiumCard
                icon={Truck}
                title={`Boka transport — ${booking.client}`}
                headerAction={
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                        <React.Fragment key={s}>
                          {s > 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                          <span className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                            wizardStep === s ? "bg-primary text-primary-foreground"
                              : wizardStep > s ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {wizardStep > s ? <Check className="h-3.5 w-3.5" /> : s}
                          </span>
                          <span className="hidden sm:inline text-xs">{stepLabels[s - 1]}</span>
                        </React.Fragment>
                      ))}
                    </div>
                    <Button variant="ghost" size="icon" onClick={closeDialog} className="rounded-lg h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                }
              >
                {/* Step 1: Choose Own/Partner + select */}
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-3">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="text-sm">
                          <span className="text-muted-foreground">Leveransadress: </span>
                          <span className="font-medium">{booking.deliveryaddress || 'Ingen adress'}</span>
                          {booking.delivery_city && (
                            <span className="text-muted-foreground ml-1">({booking.delivery_city})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        className={cn(
                          "flex flex-col items-center gap-2 p-6 rounded-2xl border-2 transition-all text-center",
                          wizardData.transportMode === 'own'
                            ? "border-primary bg-primary/5 shadow-lg"
                            : "border-border/40 bg-card hover:border-primary/30 hover:shadow-md"
                        )}
                        onClick={() => setWizardData(p => ({ ...p, transportMode: 'own', vehicleId: '', vehicleType: '' }))}
                      >
                        <div className="p-3 rounded-xl bg-primary/10"><Truck className="h-6 w-6 text-primary" /></div>
                        <span className="font-semibold text-foreground">Egen bil</span>
                        <span className="text-xs text-muted-foreground">{internalVehicles.length} fordon</span>
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex flex-col items-center gap-2 p-6 rounded-2xl border-2 transition-all text-center",
                          wizardData.transportMode === 'partner'
                            ? "border-primary bg-primary/5 shadow-lg"
                            : "border-border/40 bg-card hover:border-primary/30 hover:shadow-md"
                        )}
                        onClick={() => setWizardData(p => ({ ...p, transportMode: 'partner', vehicleId: '', vehicleType: '' }))}
                      >
                        <div className="p-3 rounded-xl bg-primary/10"><Building2 className="h-6 w-6 text-primary" /></div>
                        <span className="font-semibold text-foreground">Välj partner</span>
                        <span className="text-xs text-muted-foreground">{externalPartners.length} partners</span>
                      </button>
                    </div>

                    {/* Partner list */}
                    {wizardData.transportMode === 'partner' && (
                      <div className="space-y-2">
                        <Label>Välj partner *</Label>
                        {externalPartners.length === 0 ? (
                          <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            Inga partners tillagda
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {externalPartners.map(v => (
                              <label
                                key={v.id}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                                  wizardData.vehicleId === v.id
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border/40 bg-background/60 hover:border-border"
                                )}
                                onClick={() => setWizardData(p => ({ ...p, vehicleId: v.id, vehicleType: '' }))}
                              >
                                <div className={cn(
                                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                  wizardData.vehicleId === v.id ? "border-primary" : "border-muted-foreground/40"
                                )}>
                                  {wizardData.vehicleId === v.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium">{v.name}</span>
                                  <Badge variant="outline" className="ml-2 text-[10px] h-4">Partner</Badge>
                                  {v.provided_vehicle_types && v.provided_vehicle_types.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {v.provided_vehicle_types.map(t => (
                                        <span key={t} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                          {vehicleTypeLabels[t] || t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">{v.max_weight_kg}kg / {v.max_volume_m3}m³</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Own vehicle selection */}
                    {wizardData.transportMode === 'own' && (
                      <>
                        <div className="space-y-2">
                          <Label>Fordonstyp *</Label>
                          <Select value={wizardData.vehicleType || ''} onValueChange={v => setWizardData(p => ({ ...p, vehicleType: v, vehicleId: '' }))}>
                            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Välj fordonstyp..." /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(vehicleTypeLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {wizardData.vehicleType && (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                              Tillgängliga egna fordon av typen <span className="font-medium text-foreground">{vehicleTypeLabels[wizardData.vehicleType] || wizardData.vehicleType}</span>:
                            </p>
                            {matchingOwnVehicles.length === 0 ? (
                              <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                                <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                Inga egna fordon matchar vald typ
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {matchingOwnVehicles.map(v => (
                                  <label
                                    key={v.id}
                                    className={cn(
                                      "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                                      wizardData.vehicleId === v.id
                                        ? "border-primary bg-primary/5 shadow-sm"
                                        : "border-border/40 bg-background/60 hover:border-border"
                                    )}
                                    onClick={() => setWizardData(p => ({ ...p, vehicleId: v.id }))}
                                  >
                                    <div className={cn(
                                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                      wizardData.vehicleId === v.id ? "border-primary" : "border-muted-foreground/40"
                                    )}>
                                      {wizardData.vehicleId === v.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium">{v.name}</span>
                                      {v.registration_number && <span className="text-xs text-muted-foreground ml-2">{v.registration_number}</span>}
                                    </div>
                                    <span className="text-xs text-muted-foreground">{v.max_weight_kg}kg / {v.max_volume_m3}m³</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button onClick={() => setWizardStep(2)} disabled={!wizardData.vehicleId} className="rounded-xl gap-2">
                        Nästa: {wizardData.transportMode === 'partner' ? 'Välj fordon' : 'Datum & detaljer'}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 2 (partner): Vehicle type */}
                {wizardStep === 2 && wizardData.transportMode === 'partner' && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Partner:</span>
                        <span className="font-medium">{selectedPartner?.name || '—'}</span>
                      </div>
                    </div>
                    <Label>Välj fordonstyp från {selectedPartner?.name} *</Label>
                    {selectedPartner?.provided_vehicle_types && selectedPartner.provided_vehicle_types.length > 0 ? (
                      <div className="space-y-2">
                        {selectedPartner.provided_vehicle_types.map(type => {
                          const rates = selectedPartner.vehicle_type_rates?.[type];
                          return (
                            <label
                              key={type}
                              className={cn(
                                "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                                wizardData.vehicleType === type
                                  ? "border-primary bg-primary/5 shadow-sm"
                                  : "border-border/40 bg-background/60 hover:border-border"
                              )}
                              onClick={() => setWizardData(p => ({ ...p, vehicleType: type }))}
                            >
                              <div className={cn(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                wizardData.vehicleType === type ? "border-primary" : "border-muted-foreground/40"
                              )}>
                                {wizardData.vehicleType === type && <div className="w-2 h-2 rounded-full bg-primary" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Truck className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-semibold">{vehicleTypeLabels[type] || type}</span>
                                </div>
                                {rates && (
                                  <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] text-muted-foreground">
                                    {rates.hourly_rate != null && <span className="bg-muted px-1.5 py-0.5 rounded">{rates.hourly_rate} kr/h</span>}
                                    {rates.daily_rate != null && <span className="bg-muted px-1.5 py-0.5 rounded">{rates.daily_rate} kr/dag</span>}
                                    {rates.km_rate != null && <span className="bg-muted px-1.5 py-0.5 rounded">{rates.km_rate} kr/km</span>}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                        <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Denna partner har inga fordonstyper registrerade
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2">
                      <Button variant="ghost" onClick={() => setWizardStep(1)} className="rounded-xl gap-2">
                        <ChevronLeft className="h-4 w-4" /> Tillbaka
                      </Button>
                      <Button onClick={() => setWizardStep(3)} disabled={!wizardData.vehicleType} className="rounded-xl gap-2">
                        Nästa: Datum & detaljer <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Date & details step */}
                {((wizardStep === 2 && wizardData.transportMode === 'own') ||
                  (wizardStep === 3 && wizardData.transportMode === 'partner')) && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Transportdatum *</Label>
                        <Input type="date" value={wizardData.transportDate || ''} onChange={e => setWizardData(p => ({ ...p, transportDate: e.target.value }))} className="rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label>Tid *</Label>
                        <Select value={wizardData.transportTime || ''} onValueChange={v => setWizardData(p => ({ ...p, transportTime: v }))}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Välj tid..." /></SelectTrigger>
                          <SelectContent className="max-h-[240px]">
                            {timeSlots.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Uppskattad tid (timmar)</Label>
                        <Select value={wizardData.estimatedDuration || ''} onValueChange={v => setWizardData(p => ({ ...p, estimatedDuration: v }))}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Välj antal timmar..." /></SelectTrigger>
                          <SelectContent className="max-h-[240px]">
                            {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12].map(h => (
                              <SelectItem key={h} value={String(h)}>{h} {h === 1 ? 'timme' : 'timmar'}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Upphämtningsplats *</Label>
                      <AddressAutocomplete
                        value={wizardData.pickupAddress || ''}
                        onChange={(address, lat, lng) => setWizardData(p => ({ ...p, pickupAddress: address, pickupLatitude: lat, pickupLongitude: lng }))}
                        placeholder="Sök adress..."
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Standard: David Adrians väg 1</p>
                        {wizardData.pickupLatitude && wizardData.pickupLongitude ? (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            {wizardData.pickupLatitude.toFixed(4)}, {wizardData.pickupLongitude.toFixed(4)}
                          </p>
                        ) : (
                          <p className="text-xs text-destructive">Ej geocodad</p>
                        )}
                      </div>
                      <AddressFavorites
                        currentAddress={wizardData.pickupAddress}
                        currentLat={wizardData.pickupLatitude}
                        currentLng={wizardData.pickupLongitude}
                        onSelect={(address, lat, lng) => setWizardData(p => ({ ...p, pickupAddress: address, pickupLatitude: lat, pickupLongitude: lng }))}
                      />
                    </div>

                    {/* Return transport */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm space-y-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id="includeReturnProject"
                                checked={wizardData.includeReturn || false}
                                onCheckedChange={(checked) => setWizardData(p => ({
                                  ...p,
                                  includeReturn: !!checked,
                                  returnDate: p.returnDate || booking?.rigdowndate || '',
                                  returnTime: p.returnTime || p.transportTime || '',
                                  returnPickupAddress: p.returnPickupAddress || booking?.deliveryaddress || '',
                                }))}
                                disabled={!booking?.rigdowndate}
                                className="h-5 w-5"
                              />
                              <Label htmlFor="includeReturnProject" className={cn("text-sm font-semibold cursor-pointer flex items-center gap-2", !booking?.rigdowndate && "text-muted-foreground cursor-not-allowed")}>
                                <div className="p-1 rounded-lg bg-primary/10"><RotateCcw className="h-3.5 w-3.5 text-primary" /></div>
                                Återtransport (retur)
                              </Label>
                              {!booking?.rigdowndate && <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Saknar rivningsdatum</span>}
                            </div>
                          </TooltipTrigger>
                          {!booking?.rigdowndate && <TooltipContent><p>Bokningen saknar rivningsdatum — kan ej boka retur</p></TooltipContent>}
                        </Tooltip>
                      </TooltipProvider>

                      {wizardData.includeReturn && (
                        <div className="space-y-4 pt-3 border-t border-border/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Returdatum *</Label>
                              <Input type="date" value={wizardData.returnDate || ''} onChange={e => setWizardData(p => ({ ...p, returnDate: e.target.value }))} className="rounded-xl" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Returtid *</Label>
                              <Select value={wizardData.returnTime || ''} onValueChange={v => setWizardData(p => ({ ...p, returnTime: v }))}>
                                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Välj tid..." /></SelectTrigger>
                                <SelectContent className="max-h-[240px]">
                                  {timeSlots.map(time => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Returadress (upphämtning)</Label>
                            <Input value={wizardData.returnPickupAddress || ''} onChange={e => setWizardData(p => ({ ...p, returnPickupAddress: e.target.value }))} placeholder="Leveransadressen (förifylld)" className="rounded-xl" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kontaktperson (retur) *</Label>
                            <Input value={wizardData.returnContactName || ''} onChange={e => setWizardData(p => ({ ...p, returnContactName: e.target.value }))} placeholder="Namn på kontaktperson vid upphämtning" className="rounded-xl" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uppskattad tid retur (timmar)</Label>
                            <Select
                              value={wizardData.returnEstimatedDuration || ''}
                              onValueChange={v => setWizardData(p => ({ ...p, returnEstimatedDuration: v }))}
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Välj antal timmar..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-[240px]">
                                {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12].map(h => (
                                  <SelectItem key={h} value={String(h)}>{h} {h === 1 ? 'timme' : 'timmar'}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Telefon (retur) *</Label>
                              <Input value={wizardData.returnContactPhone || ''} onChange={e => setWizardData(p => ({ ...p, returnContactPhone: e.target.value }))} placeholder="Telefonnummer" className="rounded-xl" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">E-post (retur)</Label>
                              <Input value={wizardData.returnContactEmail || ''} onChange={e => setWizardData(p => ({ ...p, returnContactEmail: e.target.value }))} placeholder="E-postadress (valfritt)" className="rounded-xl" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <Button variant="ghost" onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 2 : 1)} className="rounded-xl gap-2">
                        <ChevronLeft className="h-4 w-4" /> Tillbaka
                      </Button>
                      <Button
                        onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 4 : 3)}
                        disabled={!wizardData.transportDate || !wizardData.transportTime || !wizardData.pickupAddress ||
                          (wizardData.includeReturn && (!wizardData.returnDate || !wizardData.returnTime || !wizardData.returnContactName?.trim() || !wizardData.returnContactPhone?.trim()))}
                        className="rounded-xl gap-2"
                      >
                        Nästa: Bekräfta <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Confirm step */}
                {((wizardStep === 3 && wizardData.transportMode === 'own') ||
                  (wizardStep === 4 && wizardData.transportMode === 'partner')) && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Booking info */}
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 rounded-lg bg-primary/10"><Package className="h-3.5 w-3.5 text-primary" /></div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bokning</h4>
                        </div>
                        <div className="space-y-2">
                          <div><p className="text-[11px] text-muted-foreground">Kund</p><p className="text-sm font-semibold text-foreground">{booking?.client || '—'}</p></div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Leveransadress</p>
                            <p className="text-sm font-medium text-foreground">
                              {booking?.deliveryaddress || '—'}
                              {(booking?.delivery_postal_code || booking?.delivery_city) && (
                                <span className="text-muted-foreground">{', '}{booking?.delivery_postal_code}{booking?.delivery_postal_code && booking?.delivery_city ? ' ' : ''}{booking?.delivery_city}</span>
                              )}
                            </p>
                          </div>
                          {booking?.contact_name && (
                            <div>
                              <p className="text-[11px] text-muted-foreground">Kontaktperson (leverans)</p>
                              <p className="text-sm font-medium text-foreground">
                                {booking.contact_name}
                                {booking.contact_phone && <span className="text-muted-foreground ml-2 text-xs">{booking.contact_phone}</span>}
                              </p>
                            </div>
                          )}
                          <div className="flex gap-4">
                            {booking?.rigdaydate && <div><p className="text-[11px] text-muted-foreground">Riggdag</p><p className="text-sm font-medium text-foreground">{formatDate(booking.rigdaydate)}</p></div>}
                            {booking?.eventdate && <div><p className="text-[11px] text-muted-foreground">Eventdag</p><p className="text-sm font-medium text-foreground">{formatDate(booking.eventdate)}</p></div>}
                            {booking?.rigdowndate && <div><p className="text-[11px] text-muted-foreground">Nedrigg</p><p className="text-sm font-medium text-foreground">{formatDate(booking.rigdowndate)}</p></div>}
                          </div>
                        </div>
                      </div>

                      {/* Transport info */}
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 rounded-lg bg-primary/10"><Truck className="h-3.5 w-3.5 text-primary" /></div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transport</h4>
                        </div>
                        <div className="space-y-2">
                          {wizardData.transportMode === 'partner' && (
                            <div>
                              <p className="text-[11px] text-muted-foreground">Partner</p>
                              <p className="text-sm font-semibold text-foreground">{selectedPartner?.name || '—'}</p>
                              {selectedPartner?.contact_person && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {selectedPartner.contact_person}
                                  {selectedPartner.contact_phone && <span className="ml-2">{selectedPartner.contact_phone}</span>}
                                </p>
                              )}
                            </div>
                          )}
                          <div><p className="text-[11px] text-muted-foreground">Fordonstyp</p><p className="text-sm font-medium text-foreground">{vehicleTypeLabels[wizardData.vehicleType || ''] || '—'}</p></div>
                          {wizardData.transportMode === 'own' && (
                            <div><p className="text-[11px] text-muted-foreground">Fordon</p><p className="text-sm font-medium text-foreground">{activeVehicles.find(v => v.id === wizardData.vehicleId)?.name || '—'}</p></div>
                          )}
                          <div><p className="text-[11px] text-muted-foreground">Upphämtning</p><p className="text-sm font-medium text-foreground">{wizardData.pickupAddress || DEFAULT_PICKUP_ADDRESS}</p></div>
                          <div className="flex gap-4">
                            <div><p className="text-[11px] text-muted-foreground">Datum</p><p className="text-sm font-semibold text-foreground">{wizardData.transportDate || '—'}</p></div>
                            <div><p className="text-[11px] text-muted-foreground">Tid</p><p className="text-sm font-semibold text-foreground">{wizardData.transportTime || '—'}</p></div>
                            {wizardData.estimatedDuration && (
                              <div><p className="text-[11px] text-muted-foreground">Uppskattad tid</p><p className="text-sm font-semibold text-foreground">{wizardData.estimatedDuration} {Number(wizardData.estimatedDuration) === 1 ? 'timme' : 'timmar'}</p></div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cargo */}
                    {booking && booking.products.length > 0 && (
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-1.5 rounded-lg bg-primary/10"><Package className="h-3.5 w-3.5 text-primary" /></div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last (från bokning)</h4>
                        </div>
                        <div className="space-y-1.5">
                          {booking.products.map(product => (
                            <div key={product.id} className="flex items-center justify-between text-sm py-1 px-2 rounded-lg bg-muted/30">
                              <span className="font-medium text-foreground">{product.quantity}× {product.name}</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-2">
                                {product.estimated_weight_kg != null && <span className="flex items-center gap-0.5"><Weight className="h-3 w-3" />{product.estimated_weight_kg} kg</span>}
                                {product.estimated_volume_m3 != null && <span>{product.estimated_volume_m3} m³</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const tw = booking.products.reduce((s, p) => s + ((p.estimated_weight_kg || 0) * p.quantity), 0);
                          const tv = booking.products.reduce((s, p) => s + ((p.estimated_volume_m3 || 0) * p.quantity), 0);
                          return (tw > 0 || tv > 0) ? (
                            <div className="mt-2 pt-2 border-t border-border/40 flex gap-4 text-xs text-muted-foreground">
                              {tw > 0 && <span>Totalvikt: <strong className="text-foreground">{tw} kg</strong></span>}
                              {tv > 0 && <span>Totalvolym: <strong className="text-foreground">{tv.toFixed(2)} m³</strong></span>}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {/* Driver notes */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-lg bg-primary/10"><MessageSquare className="h-3.5 w-3.5 text-primary" /></div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kommentar till förare (valfritt)</h4>
                      </div>
                      <Textarea
                        value={wizardData.driverNotes || ''}
                        onChange={e => setWizardData(p => ({ ...p, driverNotes: e.target.value }))}
                        placeholder="T.ex. ring 30 min innan ankomst, portkod 1234..."
                        className="rounded-xl min-h-[80px] resize-none"
                        maxLength={500}
                      />
                    </div>

                    {/* Stop order */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-lg bg-primary/10"><ClipboardList className="h-3.5 w-3.5 text-primary" /></div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stopordning (valfritt)</h4>
                      </div>
                      <Input type="number" min={0} value={wizardData.stopOrder ?? ''} onChange={e => setWizardData(p => ({ ...p, stopOrder: e.target.value ? parseInt(e.target.value) : 0 }))} placeholder="T.ex. 1, 2, 3..." className="rounded-xl" />
                    </div>

                    {/* Return summary */}
                    {wizardData.includeReturn && (
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-primary/20 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="p-1.5 rounded-lg bg-primary/10"><RotateCcw className="h-3.5 w-3.5 text-primary" /></div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Återtransport (retur)</h4>
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <div><p className="text-[11px] text-muted-foreground">Returdatum</p><p className="text-sm font-semibold text-foreground">{wizardData.returnDate || '—'}</p></div>
                            <div><p className="text-[11px] text-muted-foreground">Returtid</p><p className="text-sm font-semibold text-foreground">{wizardData.returnTime || '—'}</p></div>
                            {wizardData.returnEstimatedDuration && (
                              <div><p className="text-[11px] text-muted-foreground">Uppskattad tid</p><p className="text-sm font-semibold text-foreground">{wizardData.returnEstimatedDuration} {Number(wizardData.returnEstimatedDuration) === 1 ? 'timme' : 'timmar'}</p></div>
                            )}
                          </div>
                          <div><p className="text-[11px] text-muted-foreground">Returadress</p><p className="text-sm font-medium text-foreground">{wizardData.returnPickupAddress || '—'}</p></div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Kontaktperson (retur)</p>
                            <p className="text-sm font-medium text-foreground">
                              {wizardData.returnContactName || '—'}
                              {wizardData.returnContactPhone && <span className="text-muted-foreground ml-2 text-xs">{wizardData.returnContactPhone}</span>}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <Button variant="ghost" onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 3 : 2)} className="rounded-xl gap-2">
                        <ChevronLeft className="h-4 w-4" /> Tillbaka
                      </Button>
                      <Button onClick={handleSubmitWizard} className="rounded-xl gap-2">
                        <Check className="h-4 w-4" />
                        {wizardData.includeReturn ? 'Boka transport + retur' : 'Boka transport'}
                      </Button>
                    </div>
                  </div>
                )}
              </PremiumCard>
            ) : (
              <div className="text-center py-12 text-muted-foreground">Kunde inte ladda bokningsdata</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Email preview dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={(o) => { if (!o) handleCancelEmail(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Förhandsgranska mejl
            </DialogTitle>
            <DialogDescription>Granska och redigera mejlet innan det skickas till partnern.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mottagare</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{selectedPartner?.contact_email || 'Ingen mejladress'}</Badge>
                <span className="text-xs text-muted-foreground">({selectedPartner?.contact_person || ''})</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Referensperson (vår kontakt)</Label>
                <Input value={emailReferencePerson} onChange={e => setEmailReferencePerson(e.target.value)} className="rounded-xl" placeholder="Namn på er kontaktperson..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Referensnummer</Label>
                <Input value={booking?.booking_number || ''} readOnly className="rounded-xl bg-muted/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ämnesrad</Label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Meddelande till partnern</Label>
              <Textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} rows={4} className="rounded-xl resize-none" />
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border/30 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Bokningsdetaljer (visas i mejlet)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Kund</span><span className="font-medium">{booking?.client || '—'}</span>
                <span className="text-muted-foreground">Bokningsnummer</span><span className="font-medium">{booking?.booking_number || '—'}</span>
                <span className="text-muted-foreground">Leverans</span><span className="font-medium">{booking?.deliveryaddress || '—'}</span>
                <span className="text-muted-foreground">Upphämtning</span><span className="font-medium">{wizardData.pickupAddress || '—'}</span>
                <span className="text-muted-foreground">Fordonstyp</span><span className="font-medium">{vehicleTypeLabels[wizardData.vehicleType || ''] || '—'}</span>
                <span className="text-muted-foreground">Datum</span><span className="font-medium">{wizardData.transportDate || '—'}</span>
                <span className="text-muted-foreground">Tid</span><span className="font-medium">{wizardData.transportTime || '—'}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelEmail} disabled={sendingEmail} className="rounded-xl">Avbryt</Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail} className="rounded-xl gap-2">
              <Send className="h-4 w-4" />
              {sendingEmail ? 'Skickar...' : 'Skicka mejl'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProjectTransportBookingDialog;
