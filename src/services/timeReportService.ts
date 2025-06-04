
import { supabase } from '@/integrations/supabase/client';
import { TimeReport, BookingSummary } from '@/types/timeReport';

export const timeReportService = {
  async getTimeReports(filters?: {
    staff_id?: string;
    booking_id?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<TimeReport[]> {
    const params = new URLSearchParams();
    if (filters?.staff_id) params.append('staff_id', filters.staff_id);
    if (filters?.booking_id) params.append('booking_id', filters.booking_id);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);

    const { data, error } = await supabase.functions.invoke('time-reports', {
      method: 'GET',
      body: null,
    });

    if (error) throw error;
    return data.data || [];
  },

  async createTimeReport(timeReport: Omit<TimeReport, 'id' | 'created_at' | 'updated_at'>): Promise<TimeReport> {
    const { data, error } = await supabase.functions.invoke('time-reports', {
      method: 'POST',
      body: timeReport,
    });

    if (error) throw error;
    return data.data;
  },

  async updateTimeReport(id: string, updates: Partial<TimeReport>): Promise<TimeReport> {
    const { data, error } = await supabase.functions.invoke('time-reports', {
      method: 'PUT',
      body: updates,
    });

    if (error) throw error;
    return data.data;
  },

  async deleteTimeReport(id: string): Promise<void> {
    const { error } = await supabase.functions.invoke('time-reports', {
      method: 'DELETE',
    });

    if (error) throw error;
  },

  async getFinishedJobsSummary(): Promise<BookingSummary[]> {
    const { data, error } = await supabase.functions.invoke('time-reports/summary', {
      method: 'GET',
    });

    if (error) throw error;
    return data.data || [];
  }
};
