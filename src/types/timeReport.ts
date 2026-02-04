
export interface TimeReport {
  id: string;
  staff_id: string;
  booking_id: string;
  report_date: string;
  start_time?: string;
  end_time?: string;
  hours_worked: number;
  description?: string;
  break_time?: number;
  overtime_hours?: number;
  approved?: boolean;
  approved_at?: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
  staff_members?: {
    id: string;
    name: string;
    hourly_rate?: number;
    overtime_rate?: number;
  };
  bookings?: {
    id: string;
    client: string;
    booking_number?: string;
  };
}

export interface StaffBreakdown {
  staff_name: string;
  total_hours: number;
  overtime_hours: number;
  regular_cost: number;
  overtime_cost: number;
  total_cost: number;
  reports: TimeReport[];
}

export interface BookingSummary {
  id: string;
  client: string;
  booking_number?: string;
  status: string;
  rigdaydate?: string;
  eventdate?: string;
  rigdowndate?: string;
  total_hours: number;
  total_cost: number;
  regular_cost: number;
  overtime_cost: number;
  staff_breakdown: StaffBreakdown[];
}
