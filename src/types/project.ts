export type ProjectStatus = 'planning' | 'in_progress' | 'delivered' | 'completed' | 'cancelled';

export interface Project {
  id: string;
  booking_id: string | null;
  name: string;
  status: ProjectStatus;
  project_leader: string | null;
  client: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  eventdate: string | null;
  rigdaydate: string | null;
  rigdowndate: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  internalnotes: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
  is_internal: boolean;
  location_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskPhase = 'preproduction' | 'planning' | 'setup' | 'live' | 'teardown' | 'post';

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_to_ids?: string[];
  deadline: string | null;
  completed: boolean;
  sort_order: number;
  is_info_only: boolean;
  start_date: string | null;
  end_date: string | null;
  phase: TaskPhase | null;
  dependency_task_id: string | null;
  /** Link to the mirrored execution (establishment) task */
  execution_task_id?: string | null;
  created_at: string;
  updated_at: string;
}

export const PHASE_LABELS: Record<TaskPhase, string> = {
  preproduction: 'Förproduktion',
  planning: 'Planering',
  setup: 'Rigg',
  live: 'Event',
  teardown: 'Nedrigg',
  post: 'Efterproduktion',
};

export const PHASE_ORDER: TaskPhase[] = ['preproduction', 'planning', 'setup', 'live', 'teardown', 'post'];

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
}

export interface ProjectComment {
  id: string;
  project_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string | null;
  url: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ProjectWithBooking extends Project {
  booking?: {
    id: string;
    large_project_id?: string | null;
    client: string;
    eventdate: string | null;
    rigdaydate: string | null;
    rigdowndate: string | null;
    deliveryaddress: string | null;
    delivery_city: string | null;
    delivery_postal_code: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    booking_number: string | null;
    carry_more_than_10m: boolean | null;
    ground_nails_allowed: boolean | null;
    exact_time_needed: boolean | null;
    exact_time_info: string | null;
    internalnotes: string | null;
  } | null;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planering',
  in_progress: 'Under arbete',
  delivered: 'Levererat',
  completed: 'Avslutat',
  cancelled: 'Avbokad',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};
