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
  created_at: string;
  bookings: {
    id: string;
    client: string;
    booking_number: string | null;
  } | null;
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

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, data }),
  });

  if (res.status === 401) {
    clearAuth();
    window.location.href = '/m/login';
    throw new Error('Session expired');
  }

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || 'API error');
  }

  return json as T;
}

// API methods
export const mobileApi = {
  login: (email: string, password: string) =>
    callApi<{ success: boolean; token: string; staff: MobileStaff }>('login', { email, password }),

  me: () => callApi<{ staff: MobileStaff }>('me'),

  getBookings: () => callApi<{ bookings: MobileBooking[] }>('get_bookings'),

  getBookingDetails: (bookingId: string) =>
    callApi<{ booking: any }>('get_booking_details', { booking_id: bookingId }),

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
};
