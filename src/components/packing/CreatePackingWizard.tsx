import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface CreatePackingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedBookingId?: string;
}

interface BookingOption {
  id: string;
  client: string;
  eventdate: string | null;
  booking_number: string | null;
}

interface StaffMember {
  id: string;
  name: string;
}

export default function CreatePackingWizard({ open, onOpenChange, onSuccess }: CreatePackingWizardProps) {
  const [name, setName] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>("");
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");

  const { data: bookings = [] } = useQuery({
    queryKey: ['available-bookings-packing-wizard'],
    queryFn: async () => {
      const bookingsRes = await supabase
        .from('bookings')
        .select('id, client, eventdate, booking_number')
        .order('eventdate', { ascending: true });
      const packingsRes = await supabase.from('packing_projects').select('booking_id');
      const allBookings: BookingOption[] = (bookingsRes.data || []) as BookingOption[];
      const usedBookingIds = new Set((packingsRes.data || []).map((p: { booking_id: string }) => p.booking_id));
      return allBookings.filter(b => !usedBookingIds.has(b.id));
    },
    enabled: open
  });

  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staff-members-list'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_members').select('id, name').eq('is_active', true).order('name');
      return (data || []) as StaffMember[];
    },
    enabled: open
  });

  useEffect(() => {
    if (open) {
      setName("");
      setSelectedBookingId("");
      setSelectedLeaderId("");
      setItems([]);
      setNewItem("");
    }
  }, [open]);

  const handleBookingChange = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    if (bookingId && bookingId !== "none") {
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        const dateStr = booking.eventdate
          ? format(new Date(booking.eventdate), 'd MMMM yyyy', { locale: sv })
          : '';
        setName(`${booking.client}${dateStr ? ` - ${dateStr}` : ''}`);
      }
    }
  };

  const handleAddItem = () => {
    const title = newItem.trim();
    if (!title) return;
    setItems(prev => [...prev, title]);
    setNewItem("");
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: packing, error: packingError } = await supabase
        .from('packing_projects')
        .insert({
          name: name.trim(),
          booking_id: selectedBookingId && selectedBookingId !== "none" ? selectedBookingId : null,
          project_leader: selectedLeaderId && selectedLeaderId !== "none" ? selectedLeaderId : null
        })
        .select()
        .single();
      if (packingError) throw packingError;

      if (items.length > 0) {
        const tasks = items.map((title, index) => ({
          packing_id: packing.id,
          title,
          completed: false,
          sort_order: index
        }));
        const { error: tasksError } = await supabase.from('packing_tasks').insert(tasks);
        if (tasksError) throw tasksError;
      }

      return packing;
    },
    onSuccess: () => {
      toast.success('Packning skapad');
      onSuccess();
    },
    onError: (error) => {
      console.error('Error creating packing:', error);
      toast.error('Kunde inte skapa packning');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Ange ett packningsnamn');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skapa ny packning</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Koppla till bokning</Label>
                <Select value={selectedBookingId} onValueChange={handleBookingChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj bokning..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen bokning</SelectItem>
                    {bookings.map(booking => (
                      <SelectItem key={booking.id} value={booking.id}>
                        {booking.client} {booking.eventdate && `(${format(new Date(booking.eventdate), 'd MMM', { locale: sv })})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Ansvarig</Label>
                <Select value={selectedLeaderId} onValueChange={setSelectedLeaderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj ansvarig..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen vald</SelectItem>
                    {staffMembers.map(staff => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Packningsnamn</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Bröllop Skansen 23 juli"
              />
            </div>
          </div>

          {/* Checklist items */}
          <div className="space-y-3">
            <Label>Packlista (valfritt)</Label>
            {items.length > 0 && (
              <div className="space-y-1">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm">
                    <span className="flex-1">{item}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveItem(index)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Lägg till artikel..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={handleAddItem} disabled={!newItem.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Skapar...' : 'Skapa packning'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
