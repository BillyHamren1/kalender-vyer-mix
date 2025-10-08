
import { supabase } from '@/integrations/supabase/client';
import { TimeReport, BookingSummary } from '@/types/timeReport';

export interface TrackedTimeRequest {
  start_date?: string;
  end_date?: string;
  user_ids?: string[] | null;
  booking_numbers?: string[] | null;
  format?: 'json' | 'csv' | 'geojson';
}

export interface TrackedTimeResponse {
  users: Array<{
    user_id: string;
    staff_id: string;
    user_name: string;
    user_email: string;
    jobs: Array<{
      booking_number: string;
      client_name: string;
      total_minutes: number;
      total_formatted: string;
      regular_minutes: number;
      regular_formatted: string;
      overtime_minutes: number;
      overtime_formatted: string;
      sessions: Array<{
        start_time: string;
        finish_time: string;
        total_minutes: number;
        regular_minutes: number;
        overtime_minutes: number;
        description: string;
      }>;
      days: Array<{
        date: string;
        start_time: string;
        finish_time: string;
        total_minutes: number;
        total_formatted: string;
      }>;
    }>;
    days: Array<{
      date: string;
      start_time: string;
      finish_time: string;
      total_minutes: number;
      total_formatted: string;
      jobs: Array<{
        booking_number: string;
        client_name: string;
        total_minutes: number;
      }>;
    }>;
    total_minutes: number;
    total_formatted: string;
    total_regular: number;
    total_overtime: number;
  }>;
  summary: {
    total_users: number;
    total_minutes: number;
    total_regular: number;
    total_overtime: number;
    total_formatted: string;
  };
}

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
  },

  async getTrackedTime(request: TrackedTimeRequest): Promise<TrackedTimeResponse | string> {
    const { data, error } = await supabase.functions.invoke('fetch-tracked-time', {
      body: request,
    });

    if (error) throw error;
    return data;
  }
};
