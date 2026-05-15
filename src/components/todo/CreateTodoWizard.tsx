import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, MapPin, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AddressAutocomplete } from '@/components/logistics/AddressAutocomplete';
import { useTodoTypes } from '@/hooks/useTodoTypes';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

interface CreateTodoWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedBookingId?: string | null;
  /** When provided, dialog acts as edit form instead of create. */
  todoId?: string | null;
}

interface BookingOption {
  id: string;
  client: string;
  eventdate: string | null;
  booking_number: string | null;
}

export default function CreateTodoWizard({ open, onOpenChange, onSuccess, preselectedBookingId, todoId }: CreateTodoWizardProps) {
  const isEdit = !!todoId;
  const { organizationId } = useCurrentOrg();
  const { data: todoTypes = [], createType } = useTodoTypes();

  const [typeId, setTypeId] = useState<string>('');
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [bookingPickerOpen, setBookingPickerOpen] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [assignedLeader, setAssignedLeader] = useState<string>('');

  const [client, setClient] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Preselect built-in pickup when types load
  useEffect(() => {
    if (open && !typeId && todoTypes.length > 0) {
      setTypeId(todoTypes.find(t => t.key === 'pickup')?.id || todoTypes[0].id);
    }
  }, [open, typeId, todoTypes]);

  // Reset on open
  useEffect(() => {
    if (open && !todoId) {
      setShowNewType(false);
      setNewTypeLabel('');
      setAssignedLeader('');
      setClient('');
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setAddress('');
      setCity('');
      setPostalCode('');
      setLatitude(undefined);
      setLongitude(undefined);
      setScheduledDate('');
      setStartTime('');
      setEndTime('');
      setInternalNotes('');
      if (!preselectedBookingId) {
        setSelectedBookingId('');
        setTitle('');
      }
    }
  }, [open, preselectedBookingId, todoId]);

  // Bookings dropdown
  const { data: bookings = [] } = useQuery({
    queryKey: ['todo-wizard-bookings', organizationId],
    enabled: open && !!organizationId,
    queryFn: async (): Promise<BookingOption[]> => {
      const { data } = await supabase
        .from('bookings')
        .select('id, client, eventdate, booking_number')
        .eq('organization_id', organizationId!)
        .order('eventdate', { ascending: false })
        .limit(500);
      return (data || []) as any;
    },
  });

  // Load existing todo for edit mode
  useQuery({
    queryKey: ['todo-edit-load', todoId],
    enabled: open && !!todoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('todos')
        .select('*')
        .eq('id', todoId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setTypeId(data.type_id || '');
        setTitle(data.title || '');
        setSelectedBookingId(data.booking_id || '');
        setAssignedLeader(data.assigned_leader || '');
        setClient(data.client || '');
        setContactName(data.contact_name || '');
        setContactPhone(data.contact_phone || '');
        setContactEmail(data.contact_email || '');
        setAddress(data.address || '');
        setCity(data.city || '');
        setPostalCode(data.postal_code || '');
        setLatitude(data.latitude ?? undefined);
        setLongitude(data.longitude ?? undefined);
        setScheduledDate(data.scheduled_date || '');
        setStartTime(data.start_time ? String(data.start_time).slice(0, 5) : '');
        setEndTime(data.end_time ? String(data.end_time).slice(0, 5) : '');
        setInternalNotes(data.internal_notes || '');
      }
      return data;
    },
    staleTime: 0,
  });
  // Profiles for leader
  const { data: leaders = [] } = useQuery({
    queryKey: ['todo-wizard-leaders'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name, email').order('full_name');
      return (data || []).filter((p: any) => p.full_name || p.email);
    },
  });

  // Auto-fill title from type + booking
  const selectedType = useMemo(() => todoTypes.find(t => t.id === typeId), [todoTypes, typeId]);
  useEffect(() => {
    if (!selectedType || title) return;
    if (selectedBookingId && selectedBookingId !== 'none') {
      const b = bookings.find(x => x.id === selectedBookingId);
      if (b) setTitle(`${selectedType.label} – ${b.client}`);
    } else {
      setTitle(selectedType.label);
    }
  }, [selectedType, selectedBookingId, bookings, title]);

  // Preselect booking
  useEffect(() => {
    if (open && preselectedBookingId && bookings.length > 0) {
      setSelectedBookingId(preselectedBookingId);
    }
  }, [open, preselectedBookingId, bookings]);

  const handleCreateType = async () => {
    if (!newTypeLabel.trim()) return;
    try {
      const t = await createType.mutateAsync(newTypeLabel.trim());
      setTypeId(t.id);
      setShowNewType(false);
      setNewTypeLabel('');
      toast.success('Ny typ skapad');
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte skapa typ');
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!typeId) throw new Error('Välj typ');
      if (!title.trim()) throw new Error('Ange en titel');
      const bookingId = selectedBookingId && selectedBookingId !== 'none' ? selectedBookingId : null;

      const payload = {
        type_id: typeId,
        title: title.trim(),
        booking_id: bookingId,
        client: client.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        postal_code: postalCode.trim() || null,
        latitude,
        longitude,
        scheduled_date: scheduledDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        assigned_leader: assignedLeader && assignedLeader !== 'none' ? assignedLeader : null,
        internal_notes: internalNotes.trim() || null,
      };

      if (isEdit && todoId) {
        const { data: todo, error } = await (supabase as any)
          .from('todos')
          .update(payload)
          .eq('id', todoId)
          .select()
          .single();
        if (error) throw error;
        return todo;
      }

      const { data: todo, error } = await supabase
        .from('todos')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return todo;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'To do uppdaterad' : 'To do skapad');
      onSuccess();
    },
    onError: (e: any) => {
      toast.error(`${isEdit ? 'Kunde inte uppdatera' : 'Kunde inte skapa'} to do: ${e?.message || 'Okänt fel'}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Redigera to do' : 'Skapa to do'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-5">
          {/* Typ + Bokning */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Typ</Label>
                {!showNewType ? (
                  <Select value={typeId} onValueChange={(v) => v === '__new__' ? setShowNewType(true) : setTypeId(v)}>
                    <SelectTrigger><SelectValue placeholder="Välj typ" /></SelectTrigger>
                    <SelectContent>
                      {todoTypes.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                      <SelectItem value="__new__"><span className="flex items-center gap-1 text-primary"><Plus className="w-3 h-3" />Skapa ny typ…</span></SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      placeholder="T.ex. Servicebesök"
                      value={newTypeLabel}
                      onChange={(e) => setNewTypeLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateType(); } }}
                    />
                    <Button type="button" size="sm" onClick={handleCreateType} disabled={createType.isPending}>Spara</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setShowNewType(false); setNewTypeLabel(''); }}>Avbryt</Button>
                  </div>
                )}
              </div>
              <div>
                <Label>Koppla till bokning</Label>
                {(() => {
                  const selected = bookings.find(b => b.id === selectedBookingId);
                  const selectedLabel = selected
                    ? `${selected.client}${selected.booking_number ? ` (#${selected.booking_number})` : ''}`
                    : 'Ingen bokning';
                  return (
                    <Popover open={bookingPickerOpen} onOpenChange={setBookingPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={bookingPickerOpen}
                          className={cn(
                            'w-full justify-between font-normal',
                            !selected && 'text-muted-foreground',
                          )}
                        >
                          <span className="truncate">{selectedLabel}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-0"
                        align="start"
                        style={{ width: 'var(--radix-popover-trigger-width)' }}
                      >
                        <Command
                          filter={(value, search) => {
                            if (!search) return 1;
                            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                          }}
                        >
                          <CommandInput placeholder="Sök kund eller boknings­nummer…" />
                          <CommandList className="max-h-72">
                            <CommandEmpty>Inga bokningar matchar.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="ingen bokning"
                                onSelect={() => {
                                  setSelectedBookingId('');
                                  setBookingPickerOpen(false);
                                }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', !selected ? 'opacity-100' : 'opacity-0')} />
                                Ingen bokning
                              </CommandItem>
                              {bookings.map((b) => {
                                const label = `${b.client}${b.booking_number ? ` (#${b.booking_number})` : ''}`;
                                return (
                                  <CommandItem
                                    key={b.id}
                                    value={`${b.client} ${b.booking_number ?? ''}`}
                                    onSelect={() => {
                                      setSelectedBookingId(b.id);
                                      setBookingPickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        selectedBookingId === b.id ? 'opacity-100' : 'opacity-0',
                                      )}
                                    />
                                    <span className="truncate">{label}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  );
                })()}
              </div>
            </div>
            <div>
              <Label>Titel</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="T.ex. Upphämtning lager" />
            </div>
            <div>
              <Label>Ansvarig</Label>
              <Select value={assignedLeader} onValueChange={setAssignedLeader}>
                <SelectTrigger><SelectValue placeholder="Välj ansvarig" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen</SelectItem>
                  {leaders.map((p: any) => (
                    <SelectItem key={p.user_id} value={p.full_name || p.email}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kund & kontakt */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Kund & kontakt</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kund</Label>
                <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Kundnamn" />
              </div>
              <div>
                <Label>Kontaktperson</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Namn" />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="070-xxx xx xx" />
              </div>
              <div>
                <Label>E-post</Label>
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="email@example.com" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Adress */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4" />Adress</h3>
            <AddressAutocomplete
              value={address}
              onChange={(addr, lat, lng) => { setAddress(addr); setLatitude(lat); setLongitude(lng); }}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stad</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Stad" />
              </div>
              <div>
                <Label>Postnummer</Label>
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="123 45" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Datum & tid */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Datum & tid</h3>
            <p className="text-xs text-muted-foreground">Lämna tomt om to:n ska placeras senare via "Att planera".</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Datum</Label>
                <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div>
                <Label>Starttid</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Sluttid</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <Label>Interna anteckningar</Label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Anteckningar om to:n..." rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button type="submit" disabled={create.isPending} className="bg-orange-500 hover:bg-orange-600 text-white">
              {create.isPending ? (isEdit ? 'Sparar…' : 'Skapar…') : (isEdit ? 'Spara ändringar' : 'Skapa to do')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
