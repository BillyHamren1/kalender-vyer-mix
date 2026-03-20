import { supabase } from '@/integrations/supabase/client';

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
  async getTrackedTime(request: TrackedTimeRequest): Promise<TrackedTimeResponse | string> {
    const { data, error } = await supabase.functions.invoke('fetch-tracked-time', {
      body: request,
    });

    if (error) throw error;
    return data;
  }
};
