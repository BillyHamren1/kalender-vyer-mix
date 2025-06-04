
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { timeReportService } from '@/services/timeReportService';
import { TimeReport } from '@/types/timeReport';

interface TimeReportFormProps {
  staffId?: string;
  bookingId?: string;
  onSuccess?: (report: TimeReport) => void;
  onCancel?: () => void;
}

interface FormData {
  staff_id: string;
  booking_id: string;
  report_date: string;
  start_time?: string;
  end_time?: string;
  hours_worked: number;
  description?: string;
  break_time?: number;
  overtime_hours?: number;
}

const TimeReportForm: React.FC<TimeReportFormProps> = ({
  staffId,
  bookingId,
  onSuccess,
  onCancel
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      staff_id: staffId || '',
      booking_id: bookingId || '',
      report_date: new Date().toISOString().split('T')[0],
      hours_worked: 0,
      break_time: 0,
      overtime_hours: 0
    }
  });

  const startTime = watch('start_time');
  const endTime = watch('end_time');
  const breakTime = watch('break_time') || 0;

  // Auto-calculate hours when start/end times change
  React.useEffect(() => {
    if (startTime && endTime) {
      const start = new Date(`2000-01-01T${startTime}`);
      const end = new Date(`2000-01-01T${endTime}`);
      const diffMs = end.getTime() - start.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const netHours = Math.max(0, diffHours - breakTime);
      setValue('hours_worked', parseFloat(netHours.toFixed(2)));
    }
  }, [startTime, endTime, breakTime, setValue]);

  const onSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true);
      const report = await timeReportService.createTimeReport(data);
      toast.success('Time report submitted successfully');
      if (onSuccess) onSuccess(report);
    } catch (error) {
      console.error('Error submitting time report:', error);
      toast.error('Failed to submit time report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Submit Time Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="report_date">Date</Label>
              <Input
                id="report_date"
                type="date"
                {...register('report_date', { required: 'Date is required' })}
              />
              {errors.report_date && (
                <p className="text-sm text-red-600">{errors.report_date.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="hours_worked">Hours Worked</Label>
              <Input
                id="hours_worked"
                type="number"
                step="0.25"
                min="0"
                max="24"
                {...register('hours_worked', { 
                  required: 'Hours worked is required',
                  min: { value: 0, message: 'Hours must be positive' }
                })}
              />
              {errors.hours_worked && (
                <p className="text-sm text-red-600">{errors.hours_worked.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="start_time">Start Time</Label>
              <Input
                id="start_time"
                type="time"
                {...register('start_time')}
              />
            </div>

            <div>
              <Label htmlFor="end_time">End Time</Label>
              <Input
                id="end_time"
                type="time"
                {...register('end_time')}
              />
            </div>

            <div>
              <Label htmlFor="break_time">Break Time (hours)</Label>
              <Input
                id="break_time"
                type="number"
                step="0.25"
                min="0"
                {...register('break_time')}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="overtime_hours">Overtime Hours</Label>
            <Input
              id="overtime_hours"
              type="number"
              step="0.25"
              min="0"
              {...register('overtime_hours')}
            />
          </div>

          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Describe the work performed..."
              {...register('description')}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Time Report'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default TimeReportForm;
