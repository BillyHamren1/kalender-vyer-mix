import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarIcon, Trash2 } from 'lucide-react';
import {
  getStaffAvailability,
  createAvailability,
  deleteAvailability,
  type StaffAvailability,
  type AvailabilityType,
} from '@/services/staffAvailabilityService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface StaffAvailabilityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
}

const StaffAvailabilityDialog: React.FC<StaffAvailabilityDialogProps> = ({
  isOpen,
  onClose,
  staffId,
  staffName,
}) => {
  const [availabilities, setAvailabilities] = useState<StaffAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [availabilityType, setAvailabilityType] = useState<AvailabilityType>('available');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadAvailabilities();
    }
  }, [isOpen, staffId]);

  const loadAvailabilities = async () => {
    try {
      setIsLoading(true);
      const data = await getStaffAvailability(staffId);
      setAvailabilities(data);
    } catch (error) {
      toast.error('Failed to load availability');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAvailability = async () => {
    if (!selectedRange.from || !selectedRange.to) {
      toast.error('Please select both start and end dates');
      return;
    }

    try {
      setIsLoading(true);
      await createAvailability({
        staff_id: staffId,
        start_date: selectedRange.from,
        end_date: selectedRange.to,
        availability_type: availabilityType,
        notes: notes || undefined,
      });

      toast.success('Availability period saved');
      setSelectedRange({ from: undefined, to: undefined });
      setNotes('');
      setAvailabilityType('available');
      await loadAvailabilities();
    } catch (error) {
      toast.error('Failed to save availability');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetAvailableIndefinitely = async () => {
    try {
      setIsLoading(true);
      const today = new Date();
      const tenYearsAhead = new Date();
      tenYearsAhead.setFullYear(tenYearsAhead.getFullYear() + 10);

      await createAvailability({
        staff_id: staffId,
        start_date: today,
        end_date: tenYearsAhead,
        availability_type: 'available',
        notes: 'Available indefinitely',
      });

      toast.success('Staff set as available indefinitely');
      await loadAvailabilities();
    } catch (error) {
      toast.error('Failed to set availability');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetUnavailableIndefinitely = async () => {
    try {
      setIsLoading(true);
      const today = new Date();
      const tenYearsAhead = new Date();
      tenYearsAhead.setFullYear(tenYearsAhead.getFullYear() + 10);

      await createAvailability({
        staff_id: staffId,
        start_date: today,
        end_date: tenYearsAhead,
        availability_type: 'unavailable',
        notes: 'Unavailable indefinitely',
      });

      toast.success('Staff set as unavailable indefinitely');
      await loadAvailabilities();
    } catch (error) {
      toast.error('Failed to set availability');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    try {
      setIsLoading(true);
      await deleteAvailability(id);
      toast.success('Availability period deleted');
      await loadAvailabilities();
    } catch (error) {
      toast.error('Failed to delete availability');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAvailabilityColor = (type: AvailabilityType) => {
    switch (type) {
      case 'available':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'unavailable':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'blocked':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  };

  const getAvailabilityLabel = (type: AvailabilityType) => {
    switch (type) {
      case 'available':
        return 'Available';
      case 'unavailable':
        return 'Unavailable';
      case 'blocked':
        return 'Blocked';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Manage Availability - {staffName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Left side - Calendar and form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Button
                onClick={handleSetAvailableIndefinitely}
                disabled={isLoading}
                className="w-full"
                variant="secondary"
              >
                ✅ Set Available Indefinitely
              </Button>
              <Button
                onClick={handleSetUnavailableIndefinitely}
                disabled={isLoading}
                className="w-full"
                variant="secondary"
              >
                ❌ Set Unavailable Indefinitely
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or select specific period
                  </span>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold mb-2 block">
                Select Period
              </Label>
              <Calendar
                mode="range"
                selected={selectedRange as any}
                onSelect={(range: any) => setSelectedRange(range || { from: undefined, to: undefined })}
                className="rounded-md border pointer-events-auto"
                numberOfMonths={1}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Availability Type</Label>
              <RadioGroup
                value={availabilityType}
                onValueChange={(value) => setAvailabilityType(value as AvailabilityType)}
              >
                <div className="flex items-center space-x-2 p-3 rounded-lg border border-green-300 bg-green-50">
                  <RadioGroupItem value="available" id="available" />
                  <Label htmlFor="available" className="cursor-pointer font-normal">
                    ✅ Available - Staff can be assigned to jobs
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded-lg border border-red-300 bg-red-50">
                  <RadioGroupItem value="unavailable" id="unavailable" />
                  <Label htmlFor="unavailable" className="cursor-pointer font-normal">
                    ❌ Unavailable - Staff is not available
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded-lg border border-yellow-300 bg-yellow-50">
                  <RadioGroupItem value="blocked" id="blocked" />
                  <Label htmlFor="blocked" className="cursor-pointer font-normal">
                    🚫 Blocked - Specifically blocked during active period
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. vacation, sick leave, training..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleSaveAvailability}
              disabled={!selectedRange.from || !selectedRange.to || isLoading}
              className="w-full"
            >
              Save Period
            </Button>
          </div>

          {/* Right side - List of existing periods */}
          <div className="space-y-3">
            <Label className="text-base font-semibold block">
              Existing Periods
            </Label>
            
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
              {isLoading && availabilities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Loading...
                </p>
              ) : availabilities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No periods added yet
                </p>
              ) : (
                availabilities.map((availability) => (
                  <Card key={availability.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <Badge
                            variant="outline"
                            className={getAvailabilityColor(availability.availability_type)}
                          >
                            {getAvailabilityLabel(availability.availability_type)}
                          </Badge>
                          <div className="text-sm">
                            <div className="font-medium">
                              {format(new Date(availability.start_date), 'dd MMM yyyy')} -{' '}
                              {format(new Date(availability.end_date), 'dd MMM yyyy')}
                            </div>
                            {availability.notes && (
                              <p className="text-muted-foreground mt-1 text-xs">
                                {availability.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAvailability(availability.id)}
                          disabled={isLoading}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StaffAvailabilityDialog;
