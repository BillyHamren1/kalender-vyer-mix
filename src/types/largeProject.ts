// Typer för Projekt stort (multi-booking project)

export type LargeProjectStatus = 'planning' | 'in_progress' | 'delivered' | 'completed';

export interface LargeProject {
  id: string;
  name: string;
  description: string | null;
  status: LargeProjectStatus;
  project_leader: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface LargeProjectBooking {
  id: string;
  large_project_id: string;
  booking_id: string;
  display_name: string | null;
  sort_order: number;
  created_at: string;
  // Joined booking data
  booking?: {
    id: string;
    client: string;
    booking_number: string | null;
    deliveryaddress: string | null;
    eventdate: string | null;
    rigdaydate: string | null;
    rigdowndate: string | null;
    contact_name: string | null;
    rig_start_time: string | null;
    rig_end_time: string | null;
    event_start_time: string | null;
    event_end_time: string | null;
    rigdown_start_time: string | null;
    rigdown_end_time: string | null;
    status: string | null;
  };
}

export interface LargeProjectTask {
  id: string;
  large_project_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  deadline: string | null;
  completed: boolean;
  is_info_only: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LargeProjectFile {
  id: string;
  large_project_id: string;
  file_name: string;
  file_type: string | null;
  url: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface LargeProjectComment {
  id: string;
  large_project_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface LargeProjectPurchase {
  id: string;
  large_project_id: string;
  description: string;
  amount: number;
  category: string | null;
  supplier: string | null;
  purchase_date: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LargeProjectBudget {
  id: string;
  large_project_id: string;
  budgeted_hours: number;
  hourly_rate: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface LargeProjectWithBookings extends LargeProject {
  bookings: LargeProjectBooking[];
  bookingCount?: number;
}

export const LARGE_PROJECT_STATUS_LABELS: Record<LargeProjectStatus, string> = {
  planning: 'Planering',
  in_progress: 'Pågående',
  delivered: 'Levererat',
  completed: 'Avslutat'
};

export const LARGE_PROJECT_STATUS_COLORS: Record<LargeProjectStatus, string> = {
  planning: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800'
};
