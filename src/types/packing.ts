export type PackingStatus = 'planning' | 'in_progress' | 'delivered' | 'completed';

export interface Packing {
  id: string;
  booking_id: string | null;
  name: string;
  status: PackingStatus;
  project_leader: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackingTask {
  id: string;
  packing_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  deadline: string | null;
  completed: boolean;
  sort_order: number;
  is_info_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface PackingTaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
}

export interface PackingComment {
  id: string;
  packing_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface PackingFile {
  id: string;
  packing_id: string;
  file_name: string;
  file_type: string | null;
  url: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface PackingWithBooking extends Packing {
  booking?: {
    id: string;
    client: string;
    eventdate: string | null;
    deliveryaddress: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    booking_number: string | null;
  } | null;
}

export const PACKING_STATUS_LABELS: Record<PackingStatus, string> = {
  planning: 'Planering',
  in_progress: 'Under arbete',
  delivered: 'Levererat',
  completed: 'Avslutat'
};

export const PACKING_STATUS_COLORS: Record<PackingStatus, string> = {
  planning: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800'
};
