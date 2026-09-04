import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Building2, Check, ChevronLeft, ChevronRight, Mail, Plus, Search, Send, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { createSupplier, createSupplierContact, listSuppliers, type WmsSupplier } from '@/services/sharedSupplierService';
import { cn } from '@/lib/utils';

const DEFAULT_PICKUP_ADDRESS = 'David Adrians Väg, 194 91 Upplands Väsby, Sweden';

const vehicleSizes = [
  ['van', 'Skåpbil'], ['light_truck', 'Lätt lastbil'], ['body_truck', 'Bodbil'],
  ['truck', 'Lastbil'], ['trailer_13m', 'Trailer 13 m'], ['truck_trailer', 'Lastbil med släp'],
  ['crane_15m', 'Kranbil 15 m'], ['crane_jib_20m', 'Kranbil med jibb 20 m'],
  ['other', 'Annat / anges i godsinfo'],
] as const;

const vehicleSizeLabel = (value?: string) => vehicleSizes.find(([key]) => key === value)?.[1] || value || 'Ej angivet';

interface BookingData {
  id: string;
  client: string;
  booking_number: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
}

interface ExternalForm {
  supplierId: string;
  contactId: string;
  vehicleSize: string;
  cargoDescription: string;
  cargoWeightKg: string;
  cargoVolumeM3: string;
  transportDate: string;
  transportTime: string;
  pickupAddress: string;
  destinationAddress: string;
  notes: string;
  includeReturn: boolean;
  returnDate: string;
  returnTime: string;
}

interface Props {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const emptyForm: ExternalForm = {
  supplierId: '', contactId: '', vehicleSize: '', cargoDescription: '', cargoWeightKg: '', cargoVolumeM3: '',
  transportDate: '', transportTime: '', pickupAddress: DEFAULT_PICKUP_ADDRESS, destinationAddress: '', notes: '',
  includeReturn: false, returnDate: '', returnTime: '',
};

export default function ProjectTransportBookingDialog({ bookingId, open, onOpenChange, onComplete }: Props) {
  const { assignBookingToVehicle } = useTransportAssignments();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<WmsSupplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [form, setForm] = useState<ExternalForm>(emptyForm);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', contact: '', email: '', phone: '' });
  const [pendingAssignmentIds, setPendingAssignmentIds] = useState<string[]>([]);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sending, setSending] = useState(false);

  const selectedSupplier = suppliers.find(supplier => supplier.id === form.supplierId) || null;
  const selectedContact = selectedSupplier?.contacts?.find(contact => contact.id === form.contactId)
    || selectedSupplier?.contacts?.[0] || null;
  const recipientEmail = selectedContact?.email || selectedSupplier?.email || '';

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter(supplier => [supplier.name, supplier.short_name, supplier.email, supplier.city]
      .filter(Boolean).some(value => String(value).toLowerCase().includes(query)));
  }, [search, suppliers]);

  const reset = () => {
    setStep(0);
    setForm(emptyForm);
    setSearch('');
    setShowCreate(false);
    setNewSupplier({ name: '', contact: '', email: '', phone: '' });
    setPendingAssignmentIds([]);
    setEmailOpen(false);
    setEmailSubject('');
    setEmailMessage('');
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  useEffect(() => {
    if (!open || !bookingId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('bookings')
        .select('id, client, booking_number, deliveryaddress, delivery_city, delivery_postal_code, contact_name, contact_phone, contact_email, rigdaydate, eventdate, rigdowndate')
        .eq('id', bookingId).single(),
      supabase.from('projects').select('id').eq('booking_id', bookingId).maybeSingle(),
      listSuppliers(),
    ]).then(([bookingResult, projectResult, supplierResult]) => {
      if (cancelled) return;
      if (bookingResult.error) throw bookingResult.error;
      setBooking(bookingResult.data as BookingData);
      setProjectId(projectResult.data?.id || null);
      setSuppliers(Array.isArray(supplierResult) ? supplierResult : []);
      const transportDate = bookingResult.data.rigdaydate || bookingResult.data.eventdate || format(new Date(), 'yyyy-MM-dd');
      const destinationAddress = [bookingResult.data.deliveryaddress, bookingResult.data.delivery_postal_code, bookingResult.data.delivery_city]
        .filter(Boolean).join(', ');
      setForm(current => ({ ...current, transportDate, returnDate: bookingResult.data.rigdowndate || '', destinationAddress }));
    }).catch(error => {
      console.error('[ProjectTransportBookingDialog] load failed', error);
      toast.error('Kunde inte ladda transportunderlaget');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId, open]);

  const createInternalTransport = async () => {
    if (!booking || saving) return;
    setSaving(true);
    const result = await assignBookingToVehicle({
      booking_id: booking.id,
      vehicle_id: null,
      transport_date: booking.rigdaydate || booking.eventdate || format(new Date(), 'yyyy-MM-dd'),
      transport_type: 'internal',
      planning_status: 'preliminary',
      origin_address: DEFAULT_PICKUP_ADDRESS,
      destination_address: form.destinationAddress || undefined,
      pickup_address: DEFAULT_PICKUP_ADDRESS,
    });
    setSaving(false);
    if (!result) return;
    onComplete();
    close();
  };

  const handleCreateSupplier = async () => {
    if (!newSupplier.name.trim() || !newSupplier.email.trim() || saving) return;
    setSaving(true);
    try {
      const created = await createSupplier({ name: newSupplier.name.trim(), email: newSupplier.email.trim(), phone: newSupplier.phone.trim() || undefined });
      let contactId = '';
      if (newSupplier.contact.trim()) {
        const contact = await createSupplierContact(created.id, {
          name: newSupplier.contact.trim(), email: newSupplier.email.trim(), phone: newSupplier.phone.trim() || undefined, is_primary: true,
        });
        contactId = contact.id;
      }
      const refreshed = await listSuppliers();
      setSuppliers(refreshed);
      setForm(current => ({ ...current, supplierId: created.id, contactId }));
      setShowCreate(false);
      toast.success('Leverantören sparades i det gemensamma registret');
    } catch (error) {
      console.error('[ProjectTransportBookingDialog] supplier create failed', error);
      toast.error('Kunde inte skapa leverantören');
    } finally {
      setSaving(false);
    }
  };

  const getLocalSupplierId = async (registryId: string) => {
    const { data, error } = await supabase.from('suppliers').select('id').eq('external_id', registryId).maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Leverantören kunde inte synkroniseras till Planning');
    return data.id;
  };

  const ensureProjectLink = async (registrySupplierId: string) => {
    if (!projectId) return;
    const { data: existing, error: findError } = await supabase.from('project_supplier_links').select('id')
      .eq('project_id', projectId).eq('supplier_id', registrySupplierId).maybeSingle();
    if (findError) throw findError;
    if (existing) return;
    const { error } = await supabase.from('project_supplier_links').insert({
      project_id: projectId,
      supplier_id: registrySupplierId,
      contact_id: form.contactId || null,
      service_type: 'Transport',
      status: 'draft',
      organization_id: '',
    });
    if (error) throw error;
  };

  const createExternalAssignments = async () => {
    if (!booking || !selectedSupplier || !recipientEmail || saving) return;
    setSaving(true);
    try {
      const localSupplierId = await getLocalSupplierId(selectedSupplier.id);
      await ensureProjectLink(selectedSupplier.id);
      const common = {
        booking_id: booking.id,
        vehicle_id: null,
        supplier_id: localSupplierId,
        supplier_contact_id: form.contactId || selectedContact?.id || null,
        planning_status: 'preliminary' as const,
        requested_vehicle_type: form.vehicleSize,
        cargo_description: form.cargoDescription.trim() || undefined,
        cargo_weight_kg: form.cargoWeightKg ? Number(form.cargoWeightKg) : undefined,
        cargo_volume_m3: form.cargoVolumeM3 ? Number(form.cargoVolumeM3) : undefined,
        driver_notes: form.notes.trim() || undefined,
      };
      const outbound = await assignBookingToVehicle({
        ...common,
        transport_date: form.transportDate,
        transport_time: form.transportTime,
        transport_type: 'delivery',
        pickup_address: form.pickupAddress,
        origin_address: form.pickupAddress,
        destination_address: form.destinationAddress,
      });
      if (!outbound) throw new Error('Kunde inte spara transporten');
      const ids = [outbound.id];
      if (form.includeReturn) {
        const returned = await assignBookingToVehicle({
          ...common,
          transport_date: form.returnDate,
          transport_time: form.returnTime,
          transport_type: 'pickup',
          pickup_address: form.destinationAddress,
          origin_address: form.destinationAddress,
          destination_address: form.pickupAddress,
        });
        if (!returned) throw new Error('Kunde inte spara returtransporten');
        ids.push(returned.id);
      }
      const greeting = selectedContact?.name || selectedSupplier.name;
      setPendingAssignmentIds(ids);
      setEmailSubject(ids.length > 1 ? `Transportförfrågan: ${booking.client} – leverans och retur` : `Transportförfrågan: ${booking.client} – ${form.transportDate}`);
      setEmailMessage(`Hej ${greeting},\n\nVi önskar boka nedanstående transport. Kontrollera uppgifterna och acceptera eller neka förfrågan via knapparna i mejlet.\n\nMed vänlig hälsning`);
      setEmailOpen(true);
      onComplete();
    } catch (error) {
      console.error('[ProjectTransportBookingDialog] assignment create failed', error);
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara transporten');
    } finally {
      setSaving(false);
    }
  };

  const sendEmail = async () => {
    if (!pendingAssignmentIds.length || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-transport-request', {
        body: { assignment_ids: pendingAssignmentIds, custom_subject: emailSubject, custom_message: emailMessage },
      });
      if (error) throw error;
      toast.success(`Transportförfrågan skickad till ${data?.sent_to || recipientEmail}`);
      close();
      onComplete();
    } catch (error) {
      console.error('[ProjectTransportBookingDialog] email failed', error);
      toast.error('Mejlet kunde inte skickas. Transporten är sparad som utkast.');
    } finally {
      setSending(false);
    }
  };

  const cancelEmail = () => {
    setEmailOpen(false);
    toast.info('Transporten är sparad, men förfrågan skickades inte');
    close();
    onComplete();
  };

  const canContinueSupplier = Boolean(selectedSupplier && recipientEmail);
  const canContinueCargo = Boolean(form.vehicleSize);
  const canCreateAssignments = Boolean(form.transportDate && form.transportTime && form.pickupAddress.trim() && form.destinationAddress.trim()
    && (!form.includeReturn || (form.returnDate && form.returnTime)));

  return (
    <>
      <Dialog open={open && !emailOpen} onOpenChange={value => { if (!value) close(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto [&>button]:hidden">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div><DialogTitle>Transport</DialogTitle><DialogDescription>{booking ? `${booking.client}${booking.booking_number ? ` · ${booking.booking_number}` : ''}` : 'Laddar bokning…'}</DialogDescription></div>
              <Button variant="ghost" size="icon" onClick={close}><X className="h-4 w-4" /></Button>
            </div>
          </DialogHeader>

          {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Laddar…</div> : step === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 py-2">
              <button type="button" onClick={createInternalTransport} disabled={saving} className="rounded-xl border p-6 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60">
                <Truck className="h-7 w-7 text-primary mb-4" /><p className="font-semibold">Intern transport</p><p className="text-sm text-muted-foreground mt-1">Markera transporten som intern. Inget mer behöver fyllas i.</p>
              </button>
              <button type="button" onClick={() => setStep(1)} className="rounded-xl border p-6 text-left transition-colors hover:border-primary hover:bg-primary/5">
                <Building2 className="h-7 w-7 text-primary mb-4" /><p className="font-semibold">Extern transport</p><p className="text-sm text-muted-foreground mt-1">Välj leverantör, ange gods och skicka en färdig förfrågan.</p>
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {['Leverantör', 'Bil / gods', 'Övrig information'].map((label, index) => <div key={label} className="flex items-center gap-2">{index > 0 && <ChevronRight className="h-3 w-3" />}<span className={cn('rounded-full px-2.5 py-1', step === index + 1 ? 'bg-primary text-primary-foreground' : step > index + 1 ? 'bg-primary/10 text-primary' : 'bg-muted')}>{step > index + 1 && <Check className="inline h-3 w-3 mr-1" />}{label}</span></div>)}
              </div>

              {step === 1 && <div className="space-y-4">
                <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök i gemensamma leverantörsregistret…" className="pl-9" /></div><Button variant="outline" onClick={() => setShowCreate(value => !value)}><Plus className="h-4 w-4 mr-2" />Skapa</Button></div>
                {showCreate && <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <p className="text-sm font-semibold">Ny leverantör i det gemensamma registret</p>
                  <div className="grid gap-3 sm:grid-cols-2"><div><Label>Företagsnamn *</Label><Input value={newSupplier.name} onChange={event => setNewSupplier(current => ({ ...current, name: event.target.value }))} /></div><div><Label>Kontaktperson</Label><Input value={newSupplier.contact} onChange={event => setNewSupplier(current => ({ ...current, contact: event.target.value }))} /></div><div><Label>E-post *</Label><Input type="email" value={newSupplier.email} onChange={event => setNewSupplier(current => ({ ...current, email: event.target.value }))} /></div><div><Label>Telefon</Label><Input value={newSupplier.phone} onChange={event => setNewSupplier(current => ({ ...current, phone: event.target.value }))} /></div></div>
                  <Button size="sm" onClick={handleCreateSupplier} disabled={!newSupplier.name.trim() || !newSupplier.email.trim() || saving}>{saving ? 'Sparar…' : 'Skapa leverantör'}</Button>
                </div>}
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {filteredSuppliers.map(supplier => { const firstContact = supplier.contacts?.[0]; const email = firstContact?.email || supplier.email; return <button key={supplier.id} type="button" onClick={() => setForm(current => ({ ...current, supplierId: supplier.id, contactId: firstContact?.id || '' }))} className={cn('w-full rounded-xl border p-3 text-left flex items-center gap-3', form.supplierId === supplier.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}><Building2 className="h-4 w-4 text-primary shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{supplier.name}</p><p className="text-xs text-muted-foreground truncate">{email || 'Saknar mejladress'}</p></div>{form.supplierId === supplier.id && <Check className="h-4 w-4 text-primary" />}</button>; })}
                </div>
                {selectedSupplier && selectedSupplier.contacts?.length > 1 && <div><Label>Kontaktperson</Label><Select value={form.contactId} onValueChange={value => setForm(current => ({ ...current, contactId: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectedSupplier.contacts.map(contact => <SelectItem key={contact.id} value={contact.id}>{contact.name}{contact.email ? ` · ${contact.email}` : ''}</SelectItem>)}</SelectContent></Select></div>}
                {selectedSupplier && !recipientEmail && <p className="text-sm text-destructive">Leverantören saknar mejladress. Lägg till en mejladress i leverantörsregistret innan förfrågan kan skickas.</p>}
              </div>}

              {step === 2 && <div className="space-y-4">
                <div><Label>Storlek på bil *</Label><Select value={form.vehicleSize} onValueChange={value => setForm(current => ({ ...current, vehicleSize: value }))}><SelectTrigger><SelectValue placeholder="Välj bilstorlek…" /></SelectTrigger><SelectContent>{vehicleSizes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Gods / storlek</Label><Textarea value={form.cargoDescription} onChange={event => setForm(current => ({ ...current, cargoDescription: event.target.value }))} placeholder="Exempel: 8 pallar, tältmaterial eller annan relevant beskrivning" rows={3} /></div>
                <div className="grid gap-3 sm:grid-cols-2"><div><Label>Ungefärlig vikt (kg)</Label><Input type="number" min="0" value={form.cargoWeightKg} onChange={event => setForm(current => ({ ...current, cargoWeightKg: event.target.value }))} /></div><div><Label>Ungefärlig volym (m³)</Label><Input type="number" min="0" step="0.1" value={form.cargoVolumeM3} onChange={event => setForm(current => ({ ...current, cargoVolumeM3: event.target.value }))} /></div></div>
              </div>}

              {step === 3 && <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2"><div><Label>Datum *</Label><Input type="date" value={form.transportDate} onChange={event => setForm(current => ({ ...current, transportDate: event.target.value }))} /></div><div><Label>Tid *</Label><Input type="time" value={form.transportTime} onChange={event => setForm(current => ({ ...current, transportTime: event.target.value }))} /></div></div>
                <div><Label>Från *</Label><Input value={form.pickupAddress} onChange={event => setForm(current => ({ ...current, pickupAddress: event.target.value }))} /></div>
                <div><Label>Till *</Label><Input value={form.destinationAddress} onChange={event => setForm(current => ({ ...current, destinationAddress: event.target.value }))} /></div>
                <div className="rounded-xl bg-muted/30 p-3 text-sm"><p className="text-xs text-muted-foreground">Leveranskontakt från bokningen</p><p className="font-medium">{booking?.contact_name || 'Ingen kontakt angiven'}{booking?.contact_phone ? ` · ${booking.contact_phone}` : ''}</p></div>
                <div><Label>Övrig information</Label><Textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Portkod, framkomlighet, ring före ankomst…" rows={3} /></div>
                {booking?.rigdowndate && <div className="rounded-xl border p-3 space-y-3"><div className="flex items-center gap-2"><Checkbox id="include-return" checked={form.includeReturn} onCheckedChange={checked => setForm(current => ({ ...current, includeReturn: Boolean(checked) }))} /><Label htmlFor="include-return">Skicka även förfrågan om returtransport</Label></div>{form.includeReturn && <div className="grid gap-3 sm:grid-cols-2"><div><Label>Returdatum *</Label><Input type="date" value={form.returnDate} onChange={event => setForm(current => ({ ...current, returnDate: event.target.value }))} /></div><div><Label>Returtid *</Label><Input type="time" value={form.returnTime} onChange={event => setForm(current => ({ ...current, returnTime: event.target.value }))} /></div></div>}</div>}
              </div>}

              <div className="flex items-center justify-between pt-2 border-t">
                <Button variant="ghost" onClick={() => setStep(current => (current === 1 ? 0 : current - 1) as 0 | 1 | 2 | 3)}><ChevronLeft className="h-4 w-4 mr-2" />Tillbaka</Button>
                {step < 3 ? <Button onClick={() => setStep(current => (current + 1) as 1 | 2 | 3)} disabled={step === 1 ? !canContinueSupplier : !canContinueCargo}>Nästa<ChevronRight className="h-4 w-4 ml-2" /></Button> : <Button onClick={createExternalAssignments} disabled={!canCreateAssignments || saving}>{saving ? 'Sparar…' : 'Skapa mejlförslag'}<Mail className="h-4 w-4 ml-2" /></Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={emailOpen} onOpenChange={value => { if (!value) cancelEmail(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Granska transportförfrågan</DialogTitle><DialogDescription>Mejlet är färdigt. Läs igenom och skicka när uppgifterna stämmer.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Mottagare</Label><div className="mt-1"><Badge variant="secondary">{recipientEmail}</Badge><span className="ml-2 text-sm text-muted-foreground">{selectedContact?.name || selectedSupplier?.name}</span></div></div>
            <div><Label>Ämne</Label><Input value={emailSubject} onChange={event => setEmailSubject(event.target.value)} /></div>
            <div><Label>Meddelande</Label><Textarea value={emailMessage} onChange={event => setEmailMessage(event.target.value)} rows={6} /></div>
            <div className="rounded-xl border bg-muted/20 p-4 text-sm space-y-2">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Bil</span><strong>{vehicleSizeLabel(form.vehicleSize)}</strong></div>
              {form.cargoDescription && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Gods</span><strong className="text-right">{form.cargoDescription}</strong></div>}
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Datum och tid</span><strong>{form.transportDate} {form.transportTime}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Från</span><strong className="text-right">{form.pickupAddress}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Till</span><strong className="text-right">{form.destinationAddress}</strong></div>
              {form.includeReturn && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Retur</span><strong>{form.returnDate} {form.returnTime}</strong></div>}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={cancelEmail} disabled={sending}>Spara utan att skicka</Button><Button onClick={sendEmail} disabled={sending}><Send className="h-4 w-4 mr-2" />{sending ? 'Skickar…' : 'Skicka mejl'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
