const SUPABASE_URL = "https://pihrhltinhewhoxefjxv.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mobile-app-api`;

const TOKEN_KEY = 'eventflow-mobile-token';
const STAFF_KEY = 'eventflow-mobile-staff';

export interface MobileStaff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  hourly_rate: number | null;
  overtime_rate: number | null;
}

export interface MobileBooking {
  id: string;
  client: string;
  booking_number: string | null;
  status: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
  internalnotes: string | null;
  assigned_project_id: string | null;
  assigned_project_name: string | null;
  assignment_dates: string[];
}

export interface MobileTimeReport {
  id: string;
  booking_id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  break_time: number;
  description: string | null;
  approved?: boolean;
  created_at: string;
  bookings: {
    id: string;
    client: string;
    booking_number: string | null;
  } | null;
}

export interface MobileTravelLog {
  id: string;
  staff_id: string;
  report_date: string;
  start_time: string;
  end_time: string | null;
  hours_worked: number;
  from_address: string | null;
  from_latitude: number | null;
  from_longitude: number | null;
  to_address: string | null;
  to_latitude: number | null;
  to_longitude: number | null;
  description: string | null;
  auto_detected: boolean;
  created_at: string;
}


export interface MobilePurchase {
  id: string;
  description: string;
  amount: number;
  supplier: string | null;
  category: string | null;
  receipt_url: string | null;
  created_by: string | null;
  created_at: string;
}

// Token management
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredStaff(): MobileStaff | null {
  const raw = localStorage.getItem(STAFF_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setAuth(token: string, staff: MobileStaff) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STAFF_KEY);
}

// Core API caller
async function callApi<T = any>(action: string, data?: any): Promise<T> {
  const token = getToken();
  const controller = new AbortController();
  const timeoutMs = 12000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, data }),
      signal: controller.signal,
    });

    if (res.status === 401) {
      clearAuth();
      throw new Error('Session expired');
    }

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || 'API error');
    }

    return json as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Nätverksfel: anropet tog för lång tid, försök igen.');
    }
    if (error instanceof TypeError) {
      throw new Error('Nätverksfel: kunde inte nå servern.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// API methods
export const mobileApi = {
  login: (email: string, password: string) =>
    callApi<{ success: boolean; token: string; staff: MobileStaff }>('login', { email, password }),

  me: () => callApi<{ staff: MobileStaff }>('me'),

  getBookings: () => callApi<{ bookings: MobileBooking[] }>('get_bookings'),

  getInboxJobs: () => callApi<{ bookings: { id: string; client: string; status: string; rigdaydate: string | null; eventdate: string | null; rigdowndate: string | null }[] }>('get_inbox_jobs'),

  getInboxAll: () => callApi<{ conversations: any[]; broadcasts: any[]; bookings: any[] }>('get_inbox_all'),

  getBookingDetails: (bookingId: string) =>
    callApi<{ booking: any; planning?: any; project?: any; my_time_reports?: any[]; establishment_tasks?: any[] }>('get_booking_details', { booking_id: bookingId }),

  getTimeReports: () => callApi<{ time_reports: MobileTimeReport[] }>('get_time_reports'),

  createTimeReport: (data: {
    booking_id: string;
    report_date: string;
    start_time?: string;
    end_time?: string;
    hours_worked: number;
    overtime_hours?: number;
    break_time?: number;
    description?: string;
  }) => callApi<{ success: boolean; time_report: any }>('create_time_report', data),

  updateTimeReport: (data: {
    time_report_id: string;
    start_time?: string;
    end_time?: string;
    hours_worked?: number;
    overtime_hours?: number;
    break_time?: number;
    description?: string;
  }) => callApi<{ success: boolean; time_report: any }>('update_time_report', data),

  deleteTimeReport: (timeReportId: string) =>
    callApi<{ success: boolean }>('delete_time_report', { time_report_id: timeReportId }),

  getProjectComments: (bookingId: string) =>
    callApi<{ comments: any[] }>('get_project_comments', { booking_id: bookingId }),

  getProjectFiles: (bookingId: string) =>
    callApi<{ files: any[] }>('get_project_files', { booking_id: bookingId }),

  getProjectPurchases: (bookingId: string) =>
    callApi<{ purchases: MobilePurchase[] }>('get_project_purchases', { booking_id: bookingId }),

  createPurchase: (data: {
    booking_id: string;
    description: string;
    amount: number;
    supplier?: string;
    category?: string;
    receipt_image?: string;
  }) => callApi<{ success: boolean; purchase: any }>('create_purchase', data),

  createComment: (data: {
    booking_id: string;
    content: string;
  }) => callApi<{ success: boolean }>('create_comment', data),

  uploadFile: (data: {
    booking_id: string;
    file_name: string;
    file_data: string;
    file_type: string;
  }) => callApi<{ success: boolean; url: string }>('upload_file', data),

  sendMessage: (data: {
    content: string;
    message_type?: 'text' | 'urgent';
    booking_id?: string;
  }) => callApi<{ success: boolean; message: any }>('send_message', data),

  // Direct messages
  getDirectMessages: () =>
    callApi<{ conversations: any[] }>('get_direct_messages'),

  sendDirectMessage: (data: { recipient_id: string; content: string }) =>
    callApi<{ success: boolean; message: any }>('send_direct_message', data),

  markDMRead: (senderId: string) =>
    callApi<{ success: boolean }>('mark_dm_read', { sender_id: senderId }),

  // Job chat
  getJobMessages: (bookingId: string) =>
    callApi<{ messages: any[] }>('get_job_messages', { booking_id: bookingId }),

  sendJobMessage: (data: { booking_id: string; content: string }) =>
    callApi<{ success: boolean }>('send_job_message', data),

  // Broadcasts
  getBroadcasts: () =>
    callApi<{ broadcasts: any[] }>('get_broadcasts'),

  markBroadcastRead: (broadcastId: string) =>
    callApi<{ success: boolean }>('mark_broadcast_read', { broadcast_id: broadcastId }),

  // Push notifications
  registerPushToken: (pushToken: string, platform?: string) =>
    callApi<{ success: boolean }>('register_push_token', { push_token: pushToken, platform: platform || 'android' }),

  unregisterPushToken: (pushToken: string) =>
    callApi<{ success: boolean }>('unregister_push_token', { push_token: pushToken }),

  // Location reporting
  reportLocation: (data: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
  }) => callApi<{ success: boolean }>('report_location', data),

  // Travel logs
  createTravelLog: (data: {
    from_address?: string;
    from_latitude?: number;
    from_longitude?: number;
    description?: string;
    auto_detected?: boolean;
  }) => callApi<{ success: boolean; travel_log: any }>('create_travel_log', data),

  stopTravelLog: (data: {
    travel_log_id: string;
    to_address?: string;
    to_latitude?: number;
    to_longitude?: number;
  }) => callApi<{ success: boolean; travel_log: any }>('stop_travel_log', data),

  updateTravelLog: (data: {
    travel_log_id: string;
    description?: string;
    manual_project_name?: string;
  }) => callApi<{ success: boolean; travel_log: any }>('update_travel_log', data),

  getTravelLogs: (limit?: number) =>
    callApi<{ travel_logs: MobileTravelLog[] }>('get_travel_logs', { limit }),

  getContacts: () =>
    callApi<{ contacts: { id: string; name: string; type: string }[] }>('get_contacts'),

  toggleEstablishmentTask: (taskId: string) =>
    callApi<{ success: boolean; completed: boolean }>('toggle_establishment_task', { task_id: taskId }),
};
