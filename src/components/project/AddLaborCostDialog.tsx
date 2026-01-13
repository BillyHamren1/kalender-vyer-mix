import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlannedStaffMember } from '@/types/projectStaff';

interface AddLaborCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  plannedStaff: PlannedStaffMember[];
  onSubmit: (cost: {
    project_id: string;
    staff_id: string | null;
    staff_name: string;
    description: string | null;
    hours: number;
    hourly_rate: number;
    work_date: string | null;
    created_by: string | null;
  }) => void;
}

export const AddLaborCostDialog = ({
  open,
  onOpenChange,
  projectId,
  plannedStaff,
  onSubmit
}: AddLaborCostDialogProps) => {
  const [staffId, setStaffId] = useState<string>('custom');
  const [staffName, setStaffName] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('350');
  const [workDate, setWorkDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalStaffName = staffName;
    let finalStaffId: string | null = null;

    if (staffId !== 'custom') {
      const selectedStaff = plannedStaff.find(s => s.staff_id === staffId);
      if (selectedStaff) {
        finalStaffName = selectedStaff.staff_name;
        finalStaffId = staffId;
      }
    }

    if (!finalStaffName.trim() || !hours) return;

    onSubmit({
      project_id: projectId,
      staff_id: finalStaffId,
      staff_name: finalStaffName.trim(),
      description: description.trim() || null,
      hours: parseFloat(hours),
      hourly_rate: parseFloat(hourlyRate),
      work_date: workDate || null,
      created_by: null
    });

    // Reset form
    setStaffId('custom');
    setStaffName('');
    setDescription('');
    setHours('');
    setHourlyRate('350');
    setWorkDate('');
    onOpenChange(false);
  };

  const handleStaffChange = (value: string) => {
    setStaffId(value);
    if (value !== 'custom') {
      const selectedStaff = plannedStaff.find(s => s.staff_id === value);
      if (selectedStaff) {
        setStaffName(selectedStaff.staff_name);
      }
    } else {
      setStaffName('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Lägg till arbetskostnad</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-select">Välj personal</Label>
            <Select value={staffId} onValueChange={handleStaffChange}>
              <SelectTrigger>
                <SelectValue placeholder="Välj personal eller ange manuellt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Ange manuellt</SelectItem>
                {plannedStaff.map((staff) => (
                  <SelectItem key={staff.staff_id} value={staff.staff_id}>
                    {staff.staff_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {staffId === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="staff-name">Namn *</Label>
              <Input
                id="staff-name"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="T.ex. Extern elektriker"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valfri beskrivning av arbetet"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hours">Timmar *</Label>
              <Input
                id="hours"
                type="number"
                step="0.5"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourly-rate">Timlön (kr) *</Label>
              <Input
                id="hourly-rate"
                type="number"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="350"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-date">Datum</Label>
            <Input
              id="work-date"
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit">Lägg till</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
