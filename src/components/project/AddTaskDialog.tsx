import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (task: { title: string; description?: string; assigned_to?: string | null; deadline?: string | null }) => void;
  /** If provided, filters assignee list to BSA team for this booking */
  bookingId?: string | null;
}

const AddTaskDialog = ({ open, onOpenChange, onSubmit, bookingId }: AddTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [deadline, setDeadline] = useState("");

  const { data: staffMembers = [] } = useQuery({
    queryKey: ['staff-members-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
    enabled: open
  });

  // Fetch BSA team IDs if bookingId is provided
  const { data: bsaTeamIds = [] } = useQuery({
    queryKey: ['project-team-ids', bookingId],
    queryFn: async () => {
      if (!bookingId) return [];
      const { data } = await supabase
        .from('booking_staff_assignments')
        .select('staff_id')
        .eq('booking_id', bookingId);
      return [...new Set((data || []).map(r => r.staff_id))];
    },
    enabled: open && !!bookingId,
  });

  // project_tasks are internal coordination tasks.
  // They are loosely connected to the project team (BSA),
  // but may be assigned outside the team when needed.
  const teamStaff = bsaTeamIds.length > 0
    ? staffMembers.filter(s => bsaTeamIds.includes(s.id))
    : [];
  const otherStaff = bsaTeamIds.length > 0
    ? staffMembers.filter(s => !bsaTeamIds.includes(s.id))
    : staffMembers;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const selectedId = assignedTo && assignedTo !== "none" ? assignedTo : null;

    // Soft validation: warn if assigning outside BSA team
    if (selectedId && bsaTeamIds.length > 0 && !bsaTeamIds.includes(selectedId)) {
      toast.warning("Personen är inte tillagd i projektteamet (kalenderbemanning)");
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      assigned_to: selectedId,
      deadline: deadline || null
    });

    setTitle("");
    setDescription("");
    setAssignedTo("");
    setDeadline("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till uppgift</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Rubrik *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Vad ska göras?"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mer detaljer..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{bsaTeamIds.length > 0 ? 'Tilldela från projektteam' : 'Ansvarig'}</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj person" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen</SelectItem>
                  {availableStaff.length === 0 && bsaTeamIds.length > 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground italic">
                      Lägg till personer i projektteamet först
                    </div>
                  ) : (
                    availableStaff.map(staff => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input
                id="deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Lägg till
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTaskDialog;
