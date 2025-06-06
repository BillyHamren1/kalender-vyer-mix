
import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { timeReportService } from '@/services/timeReportService';
import { TimeReport } from '@/types/timeReport';
import { toast } from 'sonner';

interface UseTrackedTimeDataProps {
  staffId: string;
  selectedDate: Date;
}

interface TrackedTimeStats {
  totalHours: number;
  totalEarnings: number;
  totalReports: number;
  overtimeHours: number;
}

export const useTrackedTimeData = ({ staffId, selectedDate }: UseTrackedTimeDataProps) => {
  const [timeReports, setTimeReports] = useState<TimeReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTrackedTimeData = async () => {
    if (!staffId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const monthStart = format(startOfMonth(selectedDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(selectedDate), 'yyyy-MM-dd');
      
      const response = await timeReportService.getTrackedTime({
        start_date: monthStart,
        end_date: monthEnd,
        user_ids: [staffId],
        format: 'json'
      });

      // Transform external API data to TimeReport format
      const transformedReports: TimeReport[] = [];
      
      if (typeof response === 'object' && response.users) {
        const user = response.users.find(u => u.user_id === staffId);
        
        if (user && user.jobs) {
          user.jobs.forEach(job => {
            job.sessions.forEach(session => {
              const report: TimeReport = {
                id: `${job.booking_number}-${session.start_time}`,
                staff_id: staffId,
                booking_id: job.booking_number,
                report_date: session.start_time.split('T')[0],
                start_time: session.start_time.split('T')[1]?.substring(0, 5),
                end_time: session.finish_time.split('T')[1]?.substring(0, 5),
                hours_worked: session.total_minutes / 60,
                overtime_hours: session.overtime_minutes / 60,
                description: session.description,
                created_at: session.start_time,
                updated_at: session.start_time,
                bookings: {
                  id: job.booking_number,
                  client: job.client_name,
                  booking_number: job.booking_number
                }
              };
              transformedReports.push(report);
            });
          });
        }
      }
      
      setTimeReports(transformedReports);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading tracked time data:', error);
      setError('Failed to load tracked time data');
      toast.error('Failed to load tracked time data');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateMonthlyStats = (reports: TimeReport[], hourlyRate: number = 0, overtimeRate?: number): TrackedTimeStats => {
    return reports.reduce(
      (acc, report) => {
        const regularHours = report.hours_worked - (report.overtime_hours || 0);
        const overtimeHours = report.overtime_hours || 0;
        const actualOvertimeRate = overtimeRate || hourlyRate;
        const earnings = (regularHours * hourlyRate) + (overtimeHours * actualOvertimeRate);
        
        return {
          totalHours: acc.totalHours + report.hours_worked,
          totalEarnings: acc.totalEarnings + earnings,
          totalReports: acc.totalReports + 1,
          overtimeHours: acc.overtimeHours + overtimeHours
        };
      },
      { totalHours: 0, totalEarnings: 0, totalReports: 0, overtimeHours: 0 }
    );
  };

  useEffect(() => {
    loadTrackedTimeData();
  }, [staffId, selectedDate]);

  return {
    timeReports,
    isLoading,
    lastUpdated,
    error,
    loadTrackedTimeData,
    calculateMonthlyStats
  };
};
