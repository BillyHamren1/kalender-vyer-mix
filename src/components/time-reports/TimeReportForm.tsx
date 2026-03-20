import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface TimeReportFormProps {
  staffId?: string;
  bookingId?: string;
  onSuccess?: () => void;
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
      const { error } = await supabase
        .from('time_reports')
        .insert({
          staff_id: data.staff_id,
          booking_id: data.booking_id,
          report_date: data.report_date,
          start_time: data.start_time || null,
          end_time: data.end_time || null,
          hours_worked: data.hours_worked,
          overtime_hours: data.overtime_hours || 0,
          break_time: data.break_time || 0,
          description: data.description || null,
          approved: false,
        });

      if (error) throw error;
      toast.success('Tidrapport skickad');
      onSuccess?.();
    } catch (error) {
      console.error('Error submitting time report:', error);
      toast.error('Kunde inte skicka tidrapporten');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Lägg till tidrapport
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="report_date">Datum</Label>
              <Input
                id="report_date"
                type="date"
                {...register('report_date', { required: 'Datum krävs' })}
              />
              {errors.report_date && (
                <p className="text-sm text-red-600">{errors.report_date.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="hours_worked">Arbetade timmar</Label>
              <Input
                id="hours_worked"
                type="number"
                step="0.25"
                min="0"
                max="24"
                {...register('hours_worked', { 
                  required: 'Timmar krävs',
                  min: { value: 0, message: 'Timmar måste vara positiva' }
                })}
              />
              {errors.hours_worked && (
                <p className="text-sm text-red-600">{errors.hours_worked.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="start_time">Starttid</Label>
              <Input id="start_time" type="time" {...register('start_time')} />
            </div>
            <div>
              <Label htmlFor="end_time">Sluttid</Label>
              <Input id="end_time" type="time" {...register('end_time')} />
            </div>
            <div>
              <Label htmlFor="break_time">Rast (timmar)</Label>
              <Input id="break_time" type="number" step="0.25" min="0" {...register('break_time')} />
            </div>
          </div>

          <div>
            <Label htmlFor="overtime_hours">Övertid (timmar)</Label>
            <Input id="overtime_hours" type="number" step="0.25" min="0" {...register('overtime_hours')} />
          </div>

          <div>
            <Label htmlFor="description">Beskrivning (valfritt)</Label>
            <Textarea
              id="description"
              placeholder="Beskriv utfört arbete..."
              {...register('description')}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Skickar...' : 'Skicka tidrapport'}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Avbryt
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default TimeReportForm;
