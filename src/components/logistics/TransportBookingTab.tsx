import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Package,
  Truck,
  Check,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Calendar,
  ClipboardList,
  X,
  ArrowRight,
  Clock,
  Building2,
  RotateCcw,
  Pencil,
  
  Mail,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PremiumCard } from '@/components/ui/PremiumCard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Vehicle } from '@/hooks/useVehicles';
import { useBookingsForTransport, BookingForTransport } from '@/hooks/useBookingsForTransport';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { cn } from '@/lib/utils';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddressFavorites } from './AddressFavorites';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

interface TransportBookingTabProps {
  vehicles: Vehicle[];
}

interface WizardData {
  booking: BookingForTransport;
  transportMode: 'own' | 'partner';
  vehicleType: string;
  transportDate: string;
  transportTime: string;
  pickupAddress: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  vehicleId: string;
  stopOrder: number;
  includeReturn: boolean;
  returnDate: string;
  returnTime: string;
  returnPickupAddress: string;
  returnContactName: string;
  returnContactPhone: string;
  returnContactEmail: string;
}

const TransportBookingTab: React.FC<TransportBookingTabProps> = ({ vehicles }) => {
  const { withoutTransport, withTransport, isLoading, refetch } = useBookingsForTransport();
  const { assignBookingToVehicle, removeAssignment, updateAssignment } = useTransportAssignments();
  const [wizardBooking, setWizardBooking] = useState<BookingForTransport | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState<Partial<WizardData>>({});
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingAssignment, setCancellingAssignment] = useState<{ id: string; vehicleName: string; bookingClient: string; transportDate: string; is_external?: boolean } | null>(null);
  const [cancellingInProgress, setCancellingInProgress] = useState(false);

  // Email preview dialog state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailReferencePerson, setEmailReferencePerson] = useState('');
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Resend email state (for editing existing assignments)
  const [resendTransportDate, setResendTransportDate] = useState('');
  const [resendTransportTime, setResendTransportTime] = useState('');
  const [resendPickupAddress, setResendPickupAddress] = useState('');
  const [resendPartnerEmail, setResendPartnerEmail] = useState('');
  const [resendPartnerName, setResendPartnerName] = useState('');
  const [resendBookingClient, setResendBookingClient] = useState('');
  const [resendBookingNumber, setResendBookingNumber] = useState('');
  const [isResendMode, setIsResendMode] = useState(false);

  const activeVehicles = vehicles.filter(v => v.is_active);

  // Internal vehicles (own fleet)
  const internalVehicles = activeVehicles.filter(v => !v.is_external);
  // External partners
  const externalPartners = activeVehicles.filter(v => v.is_external);

  // Selected partner object
  const selectedPartner = wizardData.vehicleId
    ? externalPartners.find(v => v.id === wizardData.vehicleId)
    : null;

  // Get internal vehicles matching selected type
  const matchingOwnVehicles = wizardData.vehicleType
    ? internalVehicles.filter(v => v.vehicle_type === wizardData.vehicleType)
    : [];

  // Dynamic step count based on mode
  const totalSteps = wizardData.transportMode === 'partner' ? 4 : 3;
  const stepLabels = wizardData.transportMode === 'partner'
    ? ['Välj partner', 'Välj fordon', 'Datum & Detaljer', 'Bekräfta']
    : ['Fordon', 'Datum & Detaljer', 'Bekräfta'];

  const DEFAULT_PICKUP_ADDRESS = 'David Adrians väg 1';

  // Generate time slots: 06:00–23:30 in 30-min increments
  const timeSlots = React.useMemo(() => {
    const slots: string[] = [];
    for (let h = 6; h <= 23; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (h < 23 || true) slots.push(`${String(h).padStart(2, '0')}:30`);
    }
    return slots;
  }, []);

  const startWizard = (booking: BookingForTransport) => {
    setWizardBooking(booking);
    setWizardStep(1);
    setEditingAssignmentId(null);
    setWizardData({
      booking,
      transportDate: booking.rigdaydate || booking.eventdate || format(new Date(), 'yyyy-MM-dd'),
      transportTime: '',
      pickupAddress: DEFAULT_PICKUP_ADDRESS,
      includeReturn: false,
      returnDate: booking.rigdowndate || '',
      returnTime: '',
      returnPickupAddress: booking.deliveryaddress || '',
      returnContactName: '',
      returnContactPhone: '',
      returnContactEmail: '',
    });
  };

  const startEditWizard = (booking: BookingForTransport, assignment: BookingForTransport['transport_assignments'][0]) => {
    const vehicle = activeVehicles.find(v => v.id === assignment.vehicle_id);
    const isPartner = vehicle?.is_external || assignment.is_external;
    
    setWizardBooking(booking);
    setEditingAssignmentId(assignment.id);
    setWizardData({
      booking,
      transportMode: isPartner ? 'partner' : 'own',
      vehicleId: assignment.vehicle_id,
      vehicleType: vehicle?.vehicle_type || '',
      transportDate: assignment.transport_date,
      transportTime: assignment.transport_time || '',
      pickupAddress: assignment.pickup_address || DEFAULT_PICKUP_ADDRESS,
      stopOrder: assignment.stop_order || 0,
    });
    // Jump to date & details step
    setWizardStep(isPartner ? 3 : 2);
  };

  const cancelWizard = () => {
    setWizardBooking(null);
    setWizardStep(1);
    setWizardData({});
    setEditingAssignmentId(null);
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    const success = await removeAssignment(assignmentId);
    if (success) {
      refetch();
    }
  };

  const handleOpenCancelDialog = (assignment: { id: string; vehicle_name?: string; transport_date: string; is_external?: boolean }, bookingClient: string) => {
    setCancellingAssignment({
      id: assignment.id,
      vehicleName: assignment.vehicle_name || 'Okänt fordon',
      bookingClient,
      transportDate: assignment.transport_date,
      is_external: assignment.is_external || false,
    });
    setCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingAssignment) return;
    setCancellingInProgress(true);
    try {
      // Send cancellation email to external partner before removing
      if (cancellingAssignment.is_external) {
        try {
          const { error: emailError } = await supabase.functions.invoke('send-transport-cancellation', {
            body: { assignment_id: cancellingAssignment.id },
          });
          if (emailError) {
            console.error('Cancellation email error:', emailError);
            toast.warning('Transport avbokas men mejl till partnern kunde inte skickas');
          }
        } catch (e) {
          console.error('Cancellation email invoke error:', e);
          // Continue with removal even if email fails
        }
      }

      const success = await removeAssignment(cancellingAssignment.id);
      if (success) {
        const msg = cancellingAssignment.is_external
          ? 'Transport avbokad och partner notifierad'
          : 'Transport avbokad';
        toast.success(msg);
        refetch();
      }
    } finally {
      setCancellingInProgress(false);
      setCancelDialogOpen(false);
      setCancellingAssignment(null);
    }
  };

  const handleSubmitWizard = async () => {
    if (!wizardData.vehicleId || !wizardData.transportDate || !wizardBooking) return;

    // If editing, delete the old assignment first
    if (editingAssignmentId) {
      const deleted = await removeAssignment(editingAssignmentId);
      if (!deleted) return;
    }

    const result = await assignBookingToVehicle({
      vehicle_id: wizardData.vehicleId,
      booking_id: wizardBooking.id,
      transport_date: wizardData.transportDate,
      transport_time: wizardData.transportTime || undefined,
      pickup_address: wizardData.pickupAddress || undefined,
      pickup_latitude: wizardData.pickupLatitude,
      pickup_longitude: wizardData.pickupLongitude,
      stop_order: wizardData.stopOrder || 0,
    });

    if (result && wizardData.includeReturn) {
      const returnDate = wizardData.returnDate;
      if (!returnDate) {
        toast.error('Kan inte boka retur: returdatum saknas');
        cancelWizard();
        refetch();
        return;
      }
      if (!wizardData.returnTime) {
        toast.error('Kan inte boka retur: ingen returtid vald');
        cancelWizard();
        refetch();
        return;
      }
      await assignBookingToVehicle({
        vehicle_id: wizardData.vehicleId,
        booking_id: wizardBooking.id,
        transport_date: returnDate,
        transport_time: wizardData.returnTime,
        pickup_address: wizardData.returnPickupAddress || wizardBooking.deliveryaddress || wizardData.pickupAddress || undefined,
        stop_order: (wizardData.stopOrder || 0) + 1,
        driver_notes: wizardData.returnContactName
          ? `Returkontakt: ${wizardData.returnContactName}, Tel: ${wizardData.returnContactPhone}${wizardData.returnContactEmail ? ', E-post: ' + wizardData.returnContactEmail : ''}`
          : undefined,
      });
    }

    if (result) {
      // Open email preview dialog for partner mode (not editing)
      if (wizardData.transportMode === 'partner' && result.id && !editingAssignmentId) {
        const defaultSubject = `Transportförfrågan: ${wizardBooking.client} — ${wizardData.transportDate}`;
        const partnerName = selectedPartner?.contact_person || selectedPartner?.name || 'partner';
        const defaultMessage = `Hej ${partnerName},\n\nVi har en ny transportförfrågan som vi gärna vill att ni utför. Se detaljer i mejlet.\n\nMed vänliga hälsningar,\nFrans August Logistik`;
        
        setPendingAssignmentId(result.id);
        setEmailSubject(defaultSubject);
        setEmailMessage(defaultMessage);
        setEmailReferencePerson('');
        setEmailDialogOpen(true);
        // Don't cancel wizard yet — dialog handles it
        refetch();
        return;
      }

      if (editingAssignmentId) {
        toast.success('Transportbokning uppdaterad');
      }

      cancelWizard();
      refetch();
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(new Date(d), 'd MMM', { locale: sv }); } catch { return d; }
  };

  const handleSendEmail = async () => {
    if (!pendingAssignmentId) return;
    setSendingEmail(true);
    try {
      // If resend mode, update assignment details first
      if (isResendMode) {
        const updates: Record<string, any> = {};
        if (resendTransportDate) updates.transport_date = resendTransportDate;
        if (resendTransportTime) updates.transport_time = resendTransportTime;
        if (resendPickupAddress) updates.pickup_address = resendPickupAddress;
        
        if (Object.keys(updates).length > 0) {
          const updated = await updateAssignment(pendingAssignmentId, updates);
          if (!updated) {
            toast.error('Kunde inte uppdatera transportdetaljer');
            return;
          }
        }
      }

      const { data, error } = await supabase.functions.invoke('send-transport-request', {
        body: {
          assignment_id: pendingAssignmentId,
          custom_subject: emailSubject || undefined,
          custom_message: emailMessage || undefined,
          reference_person: emailReferencePerson || undefined,
        },
      });
      if (error) {
        console.error('Email send error:', error);
        toast.error('Mejl kunde inte skickas till partnern');
      } else {
        toast.success(`Transportförfrågan skickad till ${data?.sent_to || 'partnern'}`);
      }
    } catch (e) {
      console.error('Email invoke error:', e);
      toast.error('Mejlutskick misslyckades');
    } finally {
      setSendingEmail(false);
      setEmailDialogOpen(false);
      setPendingAssignmentId(null);
      setIsResendMode(false);
      if (!isResendMode) {
        cancelWizard();
      }
      refetch();
    }
  };

  const handleCancelEmail = () => {
    setEmailDialogOpen(false);
    setPendingAssignmentId(null);
    setIsResendMode(false);
    if (!isResendMode) {
      cancelWizard();
      toast.info('Transport bokad — inget mejl skickades');
    }
  };

  // Open email dialog for an existing assignment (resend/update)
  const handleOpenResendDialog = (booking: BookingForTransport, assignment: BookingForTransport['transport_assignments'][0]) => {
    const vehicle = activeVehicles.find(v => v.id === assignment.vehicle_id);
    if (!vehicle || !vehicle.is_external) {
      toast.error('Kan bara skicka mejl till externa partners');
      return;
    }

    const partnerName = vehicle.contact_person || vehicle.name;
    const defaultSubject = `Uppdaterad transportförfrågan: ${booking.client} — ${assignment.transport_date}`;
    const defaultMessage = `Hej ${partnerName},\n\nHär kommer uppdaterad information om er transportförfrågan. Se detaljer i mejlet.\n\nMed vänliga hälsningar,\nFrans August Logistik`;

    setPendingAssignmentId(assignment.id);
    setEmailSubject(defaultSubject);
    setEmailMessage(defaultMessage);
    setEmailReferencePerson('');
    setResendTransportDate(assignment.transport_date);
    setResendTransportTime(assignment.transport_time || '');
    setResendPickupAddress(assignment.pickup_address || DEFAULT_PICKUP_ADDRESS);
    setResendPartnerEmail(vehicle.contact_email || '');
    setResendPartnerName(partnerName);
    setResendBookingClient(booking.client);
    setResendBookingNumber(booking.booking_number || '');
    setIsResendMode(true);
    setEmailDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map(i => (
          <div key={i} className="h-64 bg-muted/50 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Wizard overlay */}
      {wizardBooking && (
        <PremiumCard
          icon={Truck}
          title={`${editingAssignmentId ? 'Redigera' : 'Boka'} transport — ${wizardBooking.client}`}
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
                    <span className="hidden sm:inline text-xs">
                      {stepLabels[s - 1]}
                    </span>
                  </React.Fragment>
                ))}
              </div>
              <Button variant="ghost" size="icon" onClick={cancelWizard} className="rounded-lg h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          }
        >
          {/* Step 1: Choose Own Vehicle or Partner (+ select partner/vehicle) */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Leveransadress: </span>
                    <span className="font-medium">{wizardBooking.deliveryaddress || 'Ingen adress'}</span>
                    {wizardBooking.delivery_city && (
                      <span className="text-muted-foreground ml-1">({wizardBooking.delivery_city})</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Two big mode buttons */}
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
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Truck className="h-6 w-6 text-primary" />
                  </div>
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
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <span className="font-semibold text-foreground">Välj partner</span>
                  <span className="text-xs text-muted-foreground">{externalPartners.length} partners</span>
                </button>
              </div>

              {/* Partner mode: show partner list */}
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
                          <span className="text-xs text-muted-foreground">
                            {v.max_weight_kg}kg / {v.max_volume_m3}m³
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Own vehicle mode: show type selector then vehicle list */}
              {wizardData.transportMode === 'own' && (
                <>
                  <div className="space-y-2">
                    <Label>Fordonstyp *</Label>
                    <Select
                      value={wizardData.vehicleType || ''}
                      onValueChange={v => setWizardData(p => ({ ...p, vehicleType: v, vehicleId: '' }))}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Välj fordonstyp..." />
                      </SelectTrigger>
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
                                {v.registration_number && (
                                  <span className="text-xs text-muted-foreground ml-2">{v.registration_number}</span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {v.max_weight_kg}kg / {v.max_volume_m3}m³
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setWizardStep(2)}
                  disabled={
                    wizardData.transportMode === 'partner'
                      ? !wizardData.vehicleId
                      : !wizardData.vehicleId
                  }
                  className="rounded-xl gap-2"
                >
                  Nästa: {wizardData.transportMode === 'partner' ? 'Välj fordon' : 'Datum & detaljer'}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 (partner): Select vehicle type from partner's fleet */}
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
                              {rates.hourly_rate != null && (
                                <span className="bg-muted px-1.5 py-0.5 rounded">{rates.hourly_rate} kr/h</span>
                              )}
                              {rates.daily_rate != null && (
                                <span className="bg-muted px-1.5 py-0.5 rounded">{rates.daily_rate} kr/dag</span>
                              )}
                              {rates.km_rate != null && (
                                <span className="bg-muted px-1.5 py-0.5 rounded">{rates.km_rate} kr/km</span>
                              )}
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
                  <ChevronLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <Button
                  onClick={() => setWizardStep(3)}
                  disabled={!wizardData.vehicleType}
                  className="rounded-xl gap-2"
                >
                  Nästa: Datum & detaljer
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Date & details step (step 2 for own, step 3 for partner) */}
          {((wizardStep === 2 && wizardData.transportMode === 'own') ||
            (wizardStep === 3 && wizardData.transportMode === 'partner')) && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Transportdatum *</Label>
                  <Input
                    type="date"
                    value={wizardData.transportDate || ''}
                    onChange={e => setWizardData(p => ({ ...p, transportDate: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tid *</Label>
                  <Select
                    value={wizardData.transportTime || ''}
                    onValueChange={v => setWizardData(p => ({ ...p, transportTime: v }))}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Välj tid..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      {timeSlots.map(time => (
                        <SelectItem key={time} value={time}>{time}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Upphämtningsplats *</Label>
                <AddressAutocomplete
                  value={wizardData.pickupAddress || ''}
                  onChange={(address, lat, lng) => {
                    setWizardData(p => ({
                      ...p,
                      pickupAddress: address,
                      pickupLatitude: lat,
                      pickupLongitude: lng,
                    }));
                  }}
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
                  onSelect={(address, lat, lng) => {
                    setWizardData(p => ({
                      ...p,
                      pickupAddress: address,
                      pickupLatitude: lat,
                      pickupLongitude: lng,
                    }));
                  }}
                />
              </div>

              {/* Return transport checkbox section */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm space-y-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="includeReturn"
                          checked={wizardData.includeReturn || false}
                          onCheckedChange={(checked) => {
                            setWizardData(p => ({
                              ...p,
                              includeReturn: !!checked,
                              returnDate: p.returnDate || wizardBooking?.rigdowndate || '',
                              returnTime: p.returnTime || p.transportTime || '',
                              returnPickupAddress: p.returnPickupAddress || wizardBooking?.deliveryaddress || '',
                            }));
                          }}
                          disabled={!wizardBooking?.rigdowndate}
                          className="h-5 w-5"
                        />
                        <Label
                          htmlFor="includeReturn"
                          className={cn(
                            "text-sm font-semibold cursor-pointer flex items-center gap-2",
                            !wizardBooking?.rigdowndate && "text-muted-foreground cursor-not-allowed"
                          )}
                        >
                          <div className="p-1 rounded-lg bg-primary/10">
                            <RotateCcw className="h-3.5 w-3.5 text-primary" />
                          </div>
                          Återtransport (retur)
                        </Label>
                        {!wizardBooking?.rigdowndate && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Saknar rivningsdatum</span>
                        )}
                      </div>
                    </TooltipTrigger>
                    {!wizardBooking?.rigdowndate && (
                      <TooltipContent>
                        <p>Bokningen saknar rivningsdatum — kan ej boka retur</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>

                {wizardData.includeReturn && (
                  <div className="space-y-4 pt-3 border-t border-border/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Returdatum *</Label>
                        <Input
                          type="date"
                          value={wizardData.returnDate || ''}
                          onChange={e => setWizardData(p => ({ ...p, returnDate: e.target.value }))}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Returtid *</Label>
                        <Select
                          value={wizardData.returnTime || ''}
                          onValueChange={v => setWizardData(p => ({ ...p, returnTime: v }))}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Välj tid..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[240px]">
                            {timeSlots.map(time => (
                              <SelectItem key={time} value={time}>{time}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Returadress (upphämtning)</Label>
                      <Input
                        value={wizardData.returnPickupAddress || ''}
                        onChange={e => setWizardData(p => ({ ...p, returnPickupAddress: e.target.value }))}
                        placeholder="Leveransadressen (förifylld)"
                        className="rounded-xl"
                      />
                      <p className="text-xs text-muted-foreground">Förifylld med leveransadressen</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kontaktperson (retur) *</Label>
                      <Input
                        value={wizardData.returnContactName || ''}
                        onChange={e => setWizardData(p => ({ ...p, returnContactName: e.target.value }))}
                        placeholder="Namn på kontaktperson vid upphämtning"
                        className="rounded-xl"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Telefon (retur) *</Label>
                        <Input
                          value={wizardData.returnContactPhone || ''}
                          onChange={e => setWizardData(p => ({ ...p, returnContactPhone: e.target.value }))}
                          placeholder="Telefonnummer"
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">E-post (retur)</Label>
                        <Input
                          value={wizardData.returnContactEmail || ''}
                          onChange={e => setWizardData(p => ({ ...p, returnContactEmail: e.target.value }))}
                          placeholder="E-postadress (valfritt)"
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 2 : 1)} className="rounded-xl gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <Button
                  onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 4 : 3)}
                  disabled={
                    !wizardData.transportDate || !wizardData.transportTime || !wizardData.pickupAddress ||
                    (wizardData.includeReturn && (!wizardData.returnDate || !wizardData.returnTime || !wizardData.returnContactName?.trim() || !wizardData.returnContactPhone?.trim()))
                  }
                  className="rounded-xl gap-2"
                >
                  Nästa: Bekräfta
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Confirm step (step 3 for own, step 4 for partner) */}
          {((wizardStep === 3 && wizardData.transportMode === 'own') ||
            (wizardStep === 4 && wizardData.transportMode === 'partner')) && (
             <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Booking info card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Package className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bokning</h4>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Kund</p>
                      <p className="text-sm font-semibold text-foreground">{wizardBooking?.client || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Leveransadress</p>
                      <p className="text-sm font-medium text-foreground">
                        {wizardBooking?.deliveryaddress || '—'}
                        {(wizardBooking?.delivery_postal_code || wizardBooking?.delivery_city) && (
                          <span className="text-muted-foreground">
                            {', '}{wizardBooking?.delivery_postal_code}{wizardBooking?.delivery_postal_code && wizardBooking?.delivery_city ? ' ' : ''}{wizardBooking?.delivery_city}
                          </span>
                        )}
                      </p>
                    </div>
                    {wizardBooking?.contact_name && (
                      <div>
                        <p className="text-[11px] text-muted-foreground">Kontaktperson (leverans)</p>
                        <p className="text-sm font-medium text-foreground">
                          {wizardBooking.contact_name}
                          {wizardBooking.contact_phone && (
                            <span className="text-muted-foreground ml-2 text-xs">{wizardBooking.contact_phone}</span>
                          )}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-4">
                      {wizardBooking?.rigdaydate && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">Riggdag</p>
                          <p className="text-sm font-medium text-foreground">{formatDate(wizardBooking.rigdaydate)}</p>
                        </div>
                      )}
                      {wizardBooking?.eventdate && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">Eventdag</p>
                          <p className="text-sm font-medium text-foreground">{formatDate(wizardBooking.eventdate)}</p>
                        </div>
                      )}
                      {wizardBooking?.rigdowndate && (
                        <div>
                          <p className="text-[11px] text-muted-foreground">Nedrigg</p>
                          <p className="text-sm font-medium text-foreground">{formatDate(wizardBooking.rigdowndate)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Transport info card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Truck className="h-3.5 w-3.5 text-primary" />
                    </div>
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
                    <div>
                      <p className="text-[11px] text-muted-foreground">Fordonstyp</p>
                      <p className="text-sm font-medium text-foreground">{vehicleTypeLabels[wizardData.vehicleType || ''] || '—'}</p>
                    </div>
                    {wizardData.transportMode === 'own' && (
                      <div>
                        <p className="text-[11px] text-muted-foreground">Fordon</p>
                        <p className="text-sm font-medium text-foreground">
                          {activeVehicles.find(v => v.id === wizardData.vehicleId)?.name || '—'}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] text-muted-foreground">Upphämtning</p>
                      <p className="text-sm font-medium text-foreground">{wizardData.pickupAddress || DEFAULT_PICKUP_ADDRESS}</p>
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Datum</p>
                        <p className="text-sm font-semibold text-foreground">{wizardData.transportDate || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Tid</p>
                        <p className="text-sm font-semibold text-foreground">{wizardData.transportTime || '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stop order */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-border/40 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <ClipboardList className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stopordning (valfritt)</h4>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={wizardData.stopOrder ?? ''}
                  onChange={e => setWizardData(p => ({ ...p, stopOrder: e.target.value ? parseInt(e.target.value) : 0 }))}
                  placeholder="T.ex. 1, 2, 3..."
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Anger i vilken ordning detta stopp ska köras</p>
              </div>

              {/* Return transport summary */}
              {wizardData.includeReturn && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-card to-muted/20 border border-primary/20 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <RotateCcw className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Återtransport (retur)</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Returdatum</p>
                        <p className="text-sm font-semibold text-foreground">{wizardData.returnDate || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Returtid</p>
                        <p className="text-sm font-semibold text-foreground">{wizardData.returnTime || '—'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Returadress (upphämtning)</p>
                      <p className="text-sm font-medium text-foreground">{wizardData.returnPickupAddress || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Kontaktperson (retur)</p>
                      <p className="text-sm font-medium text-foreground">
                        {wizardData.returnContactName || '—'}
                        {wizardData.returnContactPhone && (
                          <span className="text-muted-foreground ml-2 text-xs">{wizardData.returnContactPhone}</span>
                        )}
                      </p>
                    </div>
                    {wizardData.returnContactEmail && (
                      <div>
                        <p className="text-[11px] text-muted-foreground">E-post (retur)</p>
                        <p className="text-sm font-medium text-foreground">{wizardData.returnContactEmail}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 3 : 2)} className="rounded-xl gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <Button onClick={() => handleSubmitWizard()} className="rounded-xl gap-2">
                  <Check className="h-4 w-4" />
                  {editingAssignmentId ? 'Uppdatera transport' : wizardData.includeReturn ? 'Boka transport + retur' : 'Boka transport'}
                </Button>
              </div>
            </div>
          )}
        </PremiumCard>
      )}

      {/* Two-column layout: Without / With transport */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bookings without transport */}
        <PremiumCard
          icon={Package}
          title="Ej bokad transport"
          count={withoutTransport.length}
          accentColor="amber"
        >
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {withoutTransport.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Check className="h-8 w-8 mx-auto mb-2 text-primary/50" />
                Alla bokningar har transport
              </div>
            ) : (
              withoutTransport.map(booking => (
                <div
                  key={booking.id}
                  className="p-3 rounded-xl border border-border/40 bg-background/60 hover:bg-muted/30 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{booking.client}</span>
                        {booking.booking_number && (
                          <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                            #{booking.booking_number}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {booking.deliveryaddress && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {booking.deliveryaddress}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {booking.rigdaydate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Rigg: {formatDate(booking.rigdaydate)}
                          </span>
                        )}
                        {booking.eventdate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Event: {formatDate(booking.eventdate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => startWizard(booking)}
                      className="rounded-lg h-8 text-xs shrink-0 gap-1"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Boka
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </PremiumCard>

        {/* Bookings with transport */}
        <PremiumCard
          icon={ClipboardList}
          title="Bokad transport"
          count={withTransport.length}
          accentColor="emerald"
        >
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {withTransport.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Inga bokade transporter ännu
              </div>
            ) : (
              withTransport.map(booking => (
                <div
                  key={booking.id}
                  className="p-3 rounded-xl border border-border/40 bg-background/60 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{booking.client}</span>
                        {booking.booking_number && (
                          <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                            #{booking.booking_number}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {booking.deliveryaddress && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {booking.deliveryaddress}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Show assigned vehicles with edit/delete */}
                  <div className="space-y-1.5">
                    {booking.transport_assignments.map(a => (
                      <div key={a.id} className="flex items-center gap-2 group">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] h-6 gap-1 flex-1 justify-start",
                            a.is_external && "cursor-pointer hover:bg-secondary/80"
                          )}
                          onClick={() => {
                            if (a.is_external) {
                              handleOpenResendDialog(booking, a);
                            }
                          }}
                          title={a.is_external ? 'Klicka för att skicka/uppdatera mejl' : undefined}
                        >
                          <Truck className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{a.vehicle_name} — {formatDate(a.transport_date)}</span>
                          {a.transport_time && (
                            <span className="text-muted-foreground ml-1">kl {a.transport_time}</span>
                          )}
                          {a.partner_response && a.partner_response !== 'pending' && (
                            <span className={cn(
                              "ml-1 px-1 rounded text-[9px] font-semibold",
                              a.partner_response === 'accepted' ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                            )}>
                              {a.partner_response === 'accepted' ? '✓ Accepterad' : '✗ Nekad'}
                            </span>
                          )}
                        </Badge>
                        {a.is_external && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                            onClick={() => handleOpenResendDialog(booking, a)}
                            title="Skicka mejl till partner"
                          >
                            <Mail className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => startEditWizard(booking, a)}
                          title="Redigera"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => handleOpenCancelDialog(a, booking.client)}
                          title="Avboka transport"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </PremiumCard>
      </div>

      {/* Email preview dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={(open) => { if (!open) handleCancelEmail(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              {isResendMode ? 'Skicka uppdaterad information' : 'Förhandsgranska mejl'}
            </DialogTitle>
            <DialogDescription>
              {isResendMode
                ? 'Uppdatera transportdetaljer och skicka nytt mejl till partnern.'
                : 'Granska och redigera mejlet innan det skickas till partnern.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Recipient (read-only) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Mottagare</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {isResendMode ? resendPartnerEmail : (selectedPartner?.contact_email || 'Ingen mejladress')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ({isResendMode ? resendPartnerName : (selectedPartner?.contact_person || '')})
                </span>
              </div>
            </div>

            {/* Editable transport details (resend mode) */}
            {isResendMode && (
              <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-primary">Transportdetaljer (redigerbara)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Transportdatum</Label>
                    <Input
                      type="date"
                      value={resendTransportDate}
                      onChange={e => setResendTransportDate(e.target.value)}
                      className="rounded-xl h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tid</Label>
                    <Select
                      value={resendTransportTime}
                      onValueChange={v => setResendTransportTime(v)}
                    >
                      <SelectTrigger className="rounded-xl h-9 text-sm">
                        <SelectValue placeholder="Välj tid..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[240px]">
                        {timeSlots.map(time => (
                          <SelectItem key={time} value={time}>{time}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Upphämtningsplats</Label>
                  <Input
                    value={resendPickupAddress}
                    onChange={e => setResendPickupAddress(e.target.value)}
                    className="rounded-xl h-9 text-sm"
                    placeholder="Adress..."
                  />
                </div>
              </div>
            )}

            {/* Reference person & number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email-ref-person" className="text-xs text-muted-foreground">Referensperson (vår kontakt)</Label>
                <Input
                  id="email-ref-person"
                  value={emailReferencePerson}
                  onChange={e => setEmailReferencePerson(e.target.value)}
                  className="rounded-xl"
                  placeholder="Namn på er kontaktperson..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Referensnummer</Label>
                <Input
                  value={isResendMode ? resendBookingNumber : (wizardBooking?.booking_number || '')}
                  readOnly
                  className="rounded-xl bg-muted/50"
                />
              </div>
            </div>

            {/* Subject (editable) */}
            <div className="space-y-1.5">
              <Label htmlFor="email-subject" className="text-xs text-muted-foreground">Ämnesrad</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {/* Message (editable) */}
            <div className="space-y-1.5">
              <Label htmlFor="email-message" className="text-xs text-muted-foreground">Meddelande till partnern</Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={e => setEmailMessage(e.target.value)}
                rows={4}
                className="rounded-xl resize-none"
              />
            </div>

            {/* Booking summary */}
            {!isResendMode && (
              <div className="p-3 rounded-xl bg-muted/30 border border-border/30 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Bokningsdetaljer (visas i mejlet)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Kund</span>
                  <span className="font-medium">{wizardBooking?.client || '—'}</span>
                  <span className="text-muted-foreground">Bokningsnummer</span>
                  <span className="font-medium">{wizardBooking?.booking_number || '—'}</span>
                  <span className="text-muted-foreground">Leverans</span>
                  <span className="font-medium">{wizardBooking?.deliveryaddress || '—'}</span>
                  <span className="text-muted-foreground">Upphämtning</span>
                  <span className="font-medium">{wizardData.pickupAddress || '—'}</span>
                  <span className="text-muted-foreground">Fordonstyp</span>
                  <span className="font-medium">{vehicleTypeLabels[wizardData.vehicleType || ''] || '—'}</span>
                  <span className="text-muted-foreground">Datum</span>
                  <span className="font-medium">{wizardData.transportDate || '—'}</span>
                  <span className="text-muted-foreground">Tid</span>
                  <span className="font-medium">{wizardData.transportTime || '—'}</span>
                </div>
              </div>
            )}

            {isResendMode && (
              <div className="p-3 rounded-xl bg-muted/30 border border-border/30 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Kund</p>
                <p className="text-sm font-medium">{resendBookingClient} {resendBookingNumber && `(#${resendBookingNumber})`}</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleCancelEmail} disabled={sendingEmail} className="rounded-xl">
              Avbryt
            </Button>
            <Button onClick={handleSendEmail} disabled={sendingEmail} className="rounded-xl gap-2">
              <Send className="h-4 w-4" />
              {sendingEmail ? 'Skickar...' : (isResendMode ? 'Uppdatera & skicka mejl' : 'Skicka mejl')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel transport confirmation dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-destructive" />
              Avboka transport
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Är du säker på att du vill avboka transporten?
              </span>
              {cancellingAssignment && (
                <span className="block p-3 rounded-lg bg-muted/50 border border-border/40 text-sm text-foreground">
                  <span className="font-semibold">{cancellingAssignment.vehicleName}</span>
                  {' — '}
                  {cancellingAssignment.bookingClient}
                  {' — '}
                  {cancellingAssignment.transportDate}
                </span>
              )}
              <span className="block text-xs">
                {cancellingAssignment?.is_external
                  ? 'Transporten tas bort och ett avbokningsmail skickas till partnern.'
                  : 'Transporten tas bort permanent.'}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingInProgress} className="rounded-xl">
              Behåll
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={cancellingInProgress}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancellingInProgress ? 'Avbokar...' : 'Avboka transport'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TransportBookingTab;
