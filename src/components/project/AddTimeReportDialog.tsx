import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlannedStaffMember } from '@/types/projectStaff';

interface AddTimeReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  plannedStaff: PlannedStaffMember[];
  onSubmit: (report: {
    booking_id: string;
    staff_id: string;
    report_date: string;
    start_time: string | null;
    end_time: string | null;
    hours_worked: number;
    overtime_hours: number;
    description: string | null;
  }) => void;
}

export const AddTimeReportDialog = ({
  open,
  onOpenChange,
  bookingId,
  plannedStaff,
  onSubmit
}: AddTimeReportDialogProps) => {
  const [staffId, setStaffId] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('0');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!staffId || !reportDate || !hoursWorked) return;

    onSubmit({
      booking_id: bookingId,
      staff_id: staffId,
      report_date: reportDate,
      start_time: startTime || null,
      end_time: endTime || null,
      hours_worked: parseFloat(hoursWorked),
      overtime_hours: parseFloat(overtimeHours) || 0,
      description: description.trim() || null
    });

    // Reset form
    setStaffId('');
    setReportDate('');
    setStartTime('');
    setEndTime('');
    setHoursWorked('');
    setOvertimeHours('0');
    setDescription('');
    onOpenChange(false);
  };

  // Calculate hours when start/end time changes
  const calculateHours = () => {
    if (startTime && endTime) {
      const start = new Date(`2000-01-01T${startTime}`);
      const end = new Date(`2000-01-01T${endTime}`);
      const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (diff > 0) {
        setHoursWorked(diff.toFixed(1));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Registrera tid</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-select">Personal *</Label>
            <Select value={staffId} onValueChange={setStaffId} required>
              <SelectTrigger>
                <SelectValue placeholder="Välj personal" />
              </SelectTrigger>
              <SelectContent>
                {plannedStaff.map((staff) => (
                  <SelectItem key={staff.staff_id} value={staff.staff_id}>
                    {staff.staff_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {plannedStaff.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ingen personal är planerad för detta projekt ännu.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-date">Datum *</Label>
            <Input
              id="report-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-time">Starttid</Label>
              <Input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                onBlur={calculateHours}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time">Sluttid</Label>
              <Input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                onBlur={calculateHours}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hours-worked">Arbetade timmar *</Label>
              <Input
                id="hours-worked"
                type="number"
                step="0.5"
                min="0"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
                placeholder="8"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="overtime-hours">Övertid (timmar)</Label>
              <Input
                id="overtime-hours"
                type="number"
                step="0.5"
                min="0"
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Anteckning</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valfri anteckning"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={plannedStaff.length === 0}>
              Registrera
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
