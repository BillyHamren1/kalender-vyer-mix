import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProject } from "@/services/projectService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const CreateProjectDialog = ({ open, onOpenChange, onSuccess }: CreateProjectDialogProps) => {
  const [name, setName] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");

  // Fetch bookings that don't have a project yet
  const { data: bookings = [] } = useQuery({
    queryKey: ['available-bookings'],
    queryFn: async () => {
      const { data: allBookings } = await supabase
        .from('bookings')
        .select('id, client, eventdate, booking_number')
        .order('eventdate', { ascending: true });

      const { data: existingProjects } = await supabase
        .from('projects')
        .select('booking_id');

      const usedBookingIds = new Set(existingProjects?.map(p => p.booking_id) || []);
      return (allBookings || []).filter(b => !usedBookingIds.has(b.id));
    },
    enabled: open
  });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      toast.success('Projekt skapat');
      setName("");
      setSelectedBookingId("");
      onSuccess();
    },
    onError: () => toast.error('Kunde inte skapa projekt')
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Ange ett projektnamn');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      booking_id: selectedBookingId && selectedBookingId !== "none" ? selectedBookingId : null
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skapa nytt projekt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="booking">Koppla till bokning (valfritt)</Label>
            <Select value={selectedBookingId} onValueChange={handleBookingChange}>
              <SelectTrigger>
                <SelectValue placeholder="Välj en bokning..." />
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
            <Label htmlFor="name">Projektnamn</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Bröllop Skansen 23 juli"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Skapar...' : 'Skapa projekt'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateProjectDialog;
