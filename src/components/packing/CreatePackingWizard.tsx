import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DEFAULT_CHECKLIST } from "@/components/project/defaultChecklist";
import { calculateDeadline, BookingDates } from "@/components/project/calculateDeadline";
import { ChecklistItem, ChecklistItemData } from "@/components/project/ChecklistItem";

interface CreatePackingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface BookingOption {
  id: string;
  client: string;
  eventdate: string | null;
  rigdaydate: string | null;
  rigdowndate: string | null;
  booking_number: string | null;
  created_at: string;
}

interface StaffMember {
  id: string;
  name: string;
}

export default function CreatePackingWizard({ open, onOpenChange, onSuccess }: CreatePackingWizardProps) {
  const [name, setName] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItemData[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Fetch available bookings (not used by packing_projects)
  const { data: bookings = [] } = useQuery({
    queryKey: ['available-bookings-packing-wizard'],
    queryFn: async () => {
      const bookingsRes = await supabase
        .from('bookings')
        .select('id, client, eventdate, rigdaydate, rigdowndate, booking_number, created_at')
        .order('eventdate', { ascending: true });

      // Get bookings already used by packing_projects
      const packingsRes = await supabase.from('packing_projects').select('booking_id');

      const allBookings: BookingOption[] = (bookingsRes.data || []) as BookingOption[];
      const usedBookingIds = new Set((packingsRes.data || []).map((p: { booking_id: string }) => p.booking_id));
      return allBookings.filter(b => !usedBookingIds.has(b.id));
    },
    enabled: open
  });

  // Fetch staff members for project leader selection
  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staff-members-list'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_members').select('id, name').eq('is_active', true).order('name');
      return (data || []) as StaffMember[];
    },
    enabled: open
  });

  // Initialize checklist with default items
  const initializeChecklist = useCallback((booking: BookingOption | null) => {
    const bookingDates: BookingDates = booking ? {
      rigdaydate: booking.rigdaydate,
      eventdate: booking.eventdate,
      rigdowndate: booking.rigdowndate,
      created_at: booking.created_at
    } : {
      rigdaydate: null,
      eventdate: null,
      rigdowndate: null,
      created_at: new Date().toISOString()
    };

    const items: ChecklistItemData[] = DEFAULT_CHECKLIST.map((template, index) => {
      const { date, isAsap } = calculateDeadline(template.deadlineRule, bookingDates);
      return {
        id: `item-${index}-${Date.now()}`,
        title: template.title,
        deadline: date,
        isAsap,
        isInfoOnly: template.isInfoOnly || false,
        sort_order: template.sort_order
      };
    });

    setChecklistItems(items);
  }, []);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setSelectedBookingId("");
      setSelectedLeaderId("");
      setNewTaskTitle("");
      initializeChecklist(null);
    }
  }, [open, initializeChecklist]);

  const handleBookingChange = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    if (bookingId && bookingId !== "none") {
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        const dateStr = booking.eventdate 
          ? format(new Date(booking.eventdate), 'd MMMM yyyy', { locale: sv })
          : '';
        setName(`${booking.client}${dateStr ? ` - ${dateStr}` : ''}`);
        initializeChecklist(booking);
      }
    } else {
      initializeChecklist(null);
    }
  };

  const moveItem = useCallback((dragIndex: number, hoverIndex: number) => {
    setChecklistItems(prevItems => {
      const movableItems = prevItems.filter(item => !item.isInfoOnly);
      const infoItems = prevItems.filter(item => item.isInfoOnly);
      
      const draggedItem = movableItems[dragIndex];
      if (!draggedItem) return prevItems;
      
      const newMovableItems = [...movableItems];
      newMovableItems.splice(dragIndex, 1);
      newMovableItems.splice(hoverIndex, 0, draggedItem);
      
      const reorderedItems = newMovableItems.map((item, index) => ({
        ...item,
        sort_order: index
      }));
      
      return [...reorderedItems, ...infoItems].sort((a, b) => {
        if (a.isInfoOnly && !b.isInfoOnly) return 1;
        if (!a.isInfoOnly && b.isInfoOnly) return -1;
        return a.sort_order - b.sort_order;
      });
    });
  }, []);

  const handleDeadlineChange = (id: string, date: Date | null) => {
    setChecklistItems(prev => prev.map(item => 
      item.id === id ? { ...item, deadline: date, isAsap: false } : item
    ));
  };

  const handleRemoveItem = (id: string) => {
    setChecklistItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    
    const maxSortOrder = Math.max(...checklistItems.filter(i => !i.isInfoOnly).map(i => i.sort_order), -1);
    
    setChecklistItems(prev => [...prev, {
      id: `custom-${Date.now()}`,
      title: newTaskTitle.trim(),
      deadline: null,
      isAsap: false,
      isInfoOnly: false,
      sort_order: maxSortOrder + 1
    }]);
    setNewTaskTitle("");
  };

  // Create packing mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      // Create packing project
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

      // Create tasks
      const tasks = checklistItems.map((item, index) => ({
        packing_id: packing.id,
        title: item.title,
        deadline: item.deadline ? item.deadline.toISOString().split('T')[0] : null,
        sort_order: index,
        is_info_only: item.isInfoOnly,
        completed: false
      }));

      const { error: tasksError } = await supabase
        .from('packing_tasks')
        .insert(tasks);

      if (tasksError) throw tasksError;

      return packing;
    },
    onSuccess: () => {
      toast.success('Packning skapad med checklista');
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

  const regularTasks = checklistItems.filter(item => !item.isInfoOnly);
  const infoItems = checklistItems.filter(item => item.isInfoOnly);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skapa ny packning</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Packing Information */}
          <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
            <h3 className="font-medium">Packningsinformation</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="booking">Koppla till bokning</Label>
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
                <Label htmlFor="leader">Ansvarig</Label>
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
              <Label htmlFor="name">Packningsnamn</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Bröllop Skansen 23 juli"
              />
            </div>
          </div>

          {/* Checklist Section */}
          <div className="space-y-4">
            <h3 className="font-medium">Checklista</h3>
            
            <DndProvider backend={HTML5Backend}>
              <div className="space-y-2">
                {regularTasks.map((item, index) => (
                  <ChecklistItem
                    key={item.id}
                    item={item}
                    index={index}
                    moveItem={moveItem}
                    onDeadlineChange={handleDeadlineChange}
                    onRemove={handleRemoveItem}
                  />
                ))}
                
                {infoItems.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <p className="text-xs text-muted-foreground mb-2">Referensdatum (informationspunkter)</p>
                    {infoItems.map((item, index) => (
                      <ChecklistItem
                        key={item.id}
                        item={item}
                        index={regularTasks.length + index}
                        moveItem={moveItem}
                        onDeadlineChange={handleDeadlineChange}
                        onRemove={handleRemoveItem}
                        disabled
                      />
                    ))}
                  </>
                )}
              </div>
            </DndProvider>

            {/* Add Custom Task */}
            <div className="flex gap-2 mt-4">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Lägg till egen uppgift..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTask();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAddTask}>
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
