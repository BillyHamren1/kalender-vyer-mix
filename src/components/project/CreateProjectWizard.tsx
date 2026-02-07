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
import { DEFAULT_CHECKLIST, ChecklistTemplate } from "./defaultChecklist";
import { calculateDeadline, BookingDates } from "./calculateDeadline";
import { ChecklistItem, ChecklistItemData } from "./ChecklistItem";

interface CreateProjectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preselectedBookingId?: string | null;
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

export default function CreateProjectWizard({ open, onOpenChange, onSuccess, preselectedBookingId }: CreateProjectWizardProps) {
  const [name, setName] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItemData[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Fetch available bookings (exclude those with active projects, allow cancelled/preselected)
  const { data: bookings = [] } = useQuery({
    queryKey: ['available-bookings-wizard', preselectedBookingId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bookingsRes: any = await supabase
        .from('bookings')
        .select('id, client, eventdate, rigdaydate, rigdowndate, booking_number, created_at')
        .order('eventdate', { ascending: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectsRes: any = await supabase
        .from('projects')
        .select('booking_id, status')
        .neq('status', 'cancelled'); // Only exclude bookings with ACTIVE projects

      const allBookings: BookingOption[] = bookingsRes.data || [];
      const usedBookingIds = new Set(
        (projectsRes.data || [])
          .filter((p: { booking_id: string | null }) => p.booking_id)
          .map((p: { booking_id: string }) => p.booking_id)
      );
      
      // Filter: not used by active project, OR is the preselected booking
      return allBookings.filter(b => 
        !usedBookingIds.has(b.id) || b.id === preselectedBookingId
      );
    },
    enabled: open
  });

  // Fetch system users (profiles) for project leader selection
  const { data: staffMembers = [] } = useQuery({
    queryKey: ['system-users-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name');
      return (data || [])
        .filter((p: any) => p.full_name || p.email)
        .map((p: any) => ({
          id: p.user_id,
          name: p.full_name || p.email,
        })) as StaffMember[];
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
      setNewTaskTitle("");
      setSelectedLeaderId("");
      
      // If NO preselected booking, reset everything
      if (!preselectedBookingId) {
        setName("");
        setSelectedBookingId("");
        initializeChecklist(null);
      }
    }
  }, [open, preselectedBookingId, initializeChecklist]);

  // Handle preselected booking when bookings data is loaded
  useEffect(() => {
    if (open && preselectedBookingId && bookings.length > 0) {
      const booking = bookings.find(b => b.id === preselectedBookingId);
      if (booking) {
        setSelectedBookingId(preselectedBookingId);
        const dateStr = booking.eventdate 
          ? format(new Date(booking.eventdate), 'd MMMM yyyy', { locale: sv })
          : '';
        setName(`${booking.client}${dateStr ? ` - ${dateStr}` : ''}`);
        initializeChecklist(booking);
      }
    }
  }, [open, preselectedBookingId, bookings, initializeChecklist]);

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
      // Filter out info-only items for moving
      const movableItems = prevItems.filter(item => !item.isInfoOnly);
      const infoItems = prevItems.filter(item => item.isInfoOnly);
      
      const draggedItem = movableItems[dragIndex];
      if (!draggedItem) return prevItems;
      
      const newMovableItems = [...movableItems];
      newMovableItems.splice(dragIndex, 1);
      newMovableItems.splice(hoverIndex, 0, draggedItem);
      
      // Recalculate sort_order
      const reorderedItems = newMovableItems.map((item, index) => ({
        ...item,
        sort_order: index
      }));
      
      // Add info items back at their positions
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

  // Create project mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const bookingId = selectedBookingId && selectedBookingId !== "none" ? selectedBookingId : null;
      
      // Duplicate guard: check if booking already has a project or job
      if (bookingId) {
        const { data: existingProjects } = await supabase
          .from('projects')
          .select('id')
          .eq('booking_id', bookingId)
          .neq('status', 'cancelled');
        
        if (existingProjects && existingProjects.length > 0) {
          throw new Error('Bokningen har redan ett projekt. Använd det befintliga projektet istället.');
        }
        
        const { data: existingJobs } = await supabase
          .from('jobs')
          .select('id')
          .eq('booking_id', bookingId);
        
        if (existingJobs && existingJobs.length > 0) {
          throw new Error('Bokningen har redan ett jobb (litet projekt). Använd det befintliga istället.');
        }
      }
      
      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: name.trim(),
          booking_id: bookingId,
          project_leader: selectedLeaderId && selectedLeaderId !== "none" ? selectedLeaderId : null
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Mark the booking as assigned to a project
      if (selectedBookingId && selectedBookingId !== "none") {
        await supabase
          .from('bookings')
          .update({ 
            assigned_to_project: true,
            assigned_project_id: project.id,
            assigned_project_name: name.trim()
          })
          .eq('id', selectedBookingId);
      }

      // Create tasks
      const tasks = checklistItems.map((item, index) => ({
        project_id: project.id,
        title: item.title,
        deadline: item.deadline ? item.deadline.toISOString().split('T')[0] : null,
        sort_order: index,
        is_info_only: item.isInfoOnly,
        completed: false
      }));

      const { error: tasksError } = await supabase
        .from('project_tasks')
        .insert(tasks);

      if (tasksError) throw tasksError;

      return project;
    },
    onSuccess: () => {
      toast.success('Projekt skapat med checklista');
      onSuccess();
    },
    onError: (error) => {
      console.error('Error creating project:', error);
      toast.error('Kunde inte skapa projekt');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Ange ett projektnamn');
      return;
    }
    createMutation.mutate();
  };

  // Split items into regular tasks and info items
  const regularTasks = checklistItems.filter(item => !item.isInfoOnly);
  const infoItems = checklistItems.filter(item => item.isInfoOnly);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skapa nytt projekt</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Information */}
          <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
            <h3 className="font-medium">Projektinformation</h3>
            
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
                <Label htmlFor="leader">Projektledare</Label>
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
              <Label htmlFor="name">Projektnamn</Label>
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
                {/* Regular Tasks */}
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
                
                {/* Info Items Separator */}
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
              {createMutation.isPending ? 'Skapar...' : 'Skapa projekt'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
