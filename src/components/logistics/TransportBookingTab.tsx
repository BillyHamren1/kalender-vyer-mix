import React, { useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PremiumCard } from '@/components/ui/PremiumCard';
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
  vehicleId: string;
  stopOrder: number;
}

const TransportBookingTab: React.FC<TransportBookingTabProps> = ({ vehicles }) => {
  const { withoutTransport, withTransport, isLoading, refetch } = useBookingsForTransport();
  const { assignBookingToVehicle } = useTransportAssignments();
  const [wizardBooking, setWizardBooking] = useState<BookingForTransport | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState<Partial<WizardData>>({});

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
    setWizardData({
      booking,
      transportDate: booking.rigdaydate || booking.eventdate || format(new Date(), 'yyyy-MM-dd'),
      transportTime: '',
      pickupAddress: DEFAULT_PICKUP_ADDRESS,
    });
  };

  const cancelWizard = () => {
    setWizardBooking(null);
    setWizardStep(1);
    setWizardData({});
  };

  const handleSubmitWizard = async (includeReturn?: boolean) => {
    if (!wizardData.vehicleId || !wizardData.transportDate || !wizardBooking) return;

    const result = await assignBookingToVehicle({
      vehicle_id: wizardData.vehicleId,
      booking_id: wizardBooking.id,
      transport_date: wizardData.transportDate,
      transport_time: wizardData.transportTime || undefined,
      pickup_address: wizardData.pickupAddress || undefined,
      stop_order: wizardData.stopOrder || 0,
    });

    if (result && includeReturn) {
      // Book return: swap pickup/delivery, use rigdowndate
      const returnDate = wizardBooking.rigdowndate || wizardData.transportDate;
      await assignBookingToVehicle({
        vehicle_id: wizardData.vehicleId,
        booking_id: wizardBooking.id,
        transport_date: returnDate,
        transport_time: wizardData.transportTime || undefined,
        pickup_address: wizardBooking.deliveryaddress || wizardData.pickupAddress || undefined,
        stop_order: (wizardData.stopOrder || 0) + 1,
      });
    }

    if (result) {
      cancelWizard();
      refetch();
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try { return format(new Date(d), 'd MMM', { locale: sv }); } catch { return d; }
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
          title={`Boka transport — ${wizardBooking.client}`}
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
                <Input
                  type="text"
                  value={wizardData.pickupAddress || ''}
                  onChange={e => setWizardData(p => ({ ...p, pickupAddress: e.target.value }))}
                  className="rounded-xl"
                  placeholder="David Adrians väg 1"
                />
                <p className="text-xs text-muted-foreground">Standard: David Adrians väg 1</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 2 : 1)} className="rounded-xl gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <Button
                  onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 4 : 3)}
                  disabled={!wizardData.transportDate || !wizardData.transportTime || !wizardData.pickupAddress}
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
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-muted/30 border border-border/30 space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">Sammanfattning</h4>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Kund:</span>
                    <span className="font-medium">{wizardBooking?.client || '—'}</span>
                    <span className="text-muted-foreground">Leveransadress:</span>
                    <span className="font-medium">{wizardBooking?.deliveryaddress || '—'}</span>
                    {wizardData.transportMode === 'partner' && (
                      <>
                        <span className="text-muted-foreground">Partner:</span>
                        <span className="font-medium">{selectedPartner?.name || '—'}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Fordonstyp:</span>
                    <span className="font-medium">{vehicleTypeLabels[wizardData.vehicleType || ''] || '—'}</span>
                    {wizardData.transportMode === 'own' && (
                      <>
                        <span className="text-muted-foreground">Fordon:</span>
                        <span className="font-medium">
                          {activeVehicles.find(v => v.id === wizardData.vehicleId)?.name || '—'}
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground">Upphämtning:</span>
                    <span className="font-medium">{wizardData.pickupAddress || DEFAULT_PICKUP_ADDRESS}</span>
                    <span className="text-muted-foreground">Datum:</span>
                    <span className="font-medium">{wizardData.transportDate || '—'}</span>
                    <span className="text-muted-foreground">Tid:</span>
                    <span className="font-medium">{wizardData.transportTime || '—'}</span>
                    {wizardBooking?.rigdaydate && (
                      <>
                        <span className="text-muted-foreground">Riggdag:</span>
                        <span className="font-medium">{formatDate(wizardBooking.rigdaydate)}</span>
                      </>
                    )}
                    {wizardBooking?.eventdate && (
                      <>
                        <span className="text-muted-foreground">Eventdag:</span>
                        <span className="font-medium">{formatDate(wizardBooking.eventdate)}</span>
                      </>
                    )}
                    {wizardBooking?.rigdowndate && (
                      <>
                        <span className="text-muted-foreground">Nedrigg:</span>
                        <span className="font-medium">{formatDate(wizardBooking.rigdowndate)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Stopordning (valfritt)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={wizardData.stopOrder ?? ''}
                    onChange={e => setWizardData(p => ({ ...p, stopOrder: e.target.value ? parseInt(e.target.value) : 0 }))}
                    placeholder="T.ex. 1, 2, 3..."
                    className="rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">Anger i vilken ordning detta stopp ska köras</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setWizardStep(wizardData.transportMode === 'partner' ? 3 : 2)} className="rounded-xl gap-2">
                  <ChevronLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleSubmitWizard(true)}
                    className="rounded-xl gap-2"
                    title={wizardBooking?.rigdowndate ? `Retur bokas på ${formatDate(wizardBooking.rigdowndate)}` : 'Retur bokas på samma datum'}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Boka + retur
                  </Button>
                  <Button onClick={() => handleSubmitWizard(false)} className="rounded-xl gap-2">
                    <Check className="h-4 w-4" />
                    Boka transport
                  </Button>
                </div>
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
                <Check className="h-8 w-8 mx-auto mb-2 text-emerald-500/50" />
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
                  className="p-3 rounded-xl border border-emerald-200/50 bg-emerald-50/30 transition-all"
                >
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
                    {/* Show assigned vehicles */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {booking.transport_assignments.map(a => (
                        <Badge key={a.id} variant="secondary" className="text-[10px] h-5 gap-1">
                          <Truck className="h-2.5 w-2.5" />
                          {a.vehicle_name} — {formatDate(a.transport_date)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </PremiumCard>
      </div>
    </div>
  );
};

export default TransportBookingTab;
