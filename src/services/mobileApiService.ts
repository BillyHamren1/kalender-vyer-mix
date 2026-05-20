import { Capacitor } from '@capacitor/core';

const SUPABASE_URL = "https://pihrhltinhewhoxefjxv.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mobile-app-api`;
// Login går till en separat liten edge-funktion. mobile-app-api är ~13k rader
// och har 1.5–2.5 s cold start; login-only-funktionen bootar på ~50–150 ms.
// Tokens är formatkompatibla mellan båda funktionerna.
const LOGIN_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mobile-app-auth`;
const ASSISTANT_EVENTS_URL = `${SUPABASE_URL}/functions/v1/assistant-events`;

const TOKEN_KEY = 'eventflow-mobile-token';
const STAFF_KEY = 'eventflow-mobile-staff';

export type MobileAppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

export interface MobileStaff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  hourly_rate: number | null;
  overtime_rate: number | null;
  app_roles?: MobileAppRole[];
  is_planner?: boolean;
}

// === Planner overview types ===
export interface OverviewCalendarEvent {
  id: string;
  title: string;
  event_type: string | null;
  start_time: string;
  end_time: string;
  source_date: string;
  resource_id: string;
  booking_id: string | null;
  booking_number: string | null;
  delivery_address: string | null;
}

export interface OverviewAssignment {
  id: string;
  booking_id: string | null;
  booking_number: string | null;
  booking_title: string | null;
  client: string | null;
  staff_id: string;
  staff_name: string;
  role: string;
  assignment_date: string;
  team_id: string | null;
  // Extended (deriveStaffEvents-parity) fields — may be absent on older payloads
  target_type?: 'booking' | 'large_project' | 'location';
  target_id?: string;
  target_name?: string;
  planned_start?: string;
  planned_end?: string;
  address?: string | null;
  status?: string | null;
  phase?: 'rig' | 'event' | 'rigDown';
}

export interface OverviewThread {
  booking_id: string;
  client: string;
  booking_number: string | null;
  last_message_at: string;
  last_message_preview: string;
  last_sender_name: string;
  unread_count: number;
  total_messages: number;
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
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  assigned_project_id: string | null;
  assigned_project_name: string | null;
  large_project_id: string | null;
  large_project_name: string | null;
  assignment_dates: string[];
  assignment_type?: 'scheduled' | 'project_member';
}

export interface MobileTimeReport {
  id: string;
  booking_id: string;
  large_project_id: string | null;
  large_project_name: string | null;
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

// === Unified Ops Overview ===
export interface OpsOverviewJob {
  id: string;
  type: 'booking' | 'large_project';
  target_type: 'booking' | 'large_project';
  target_id: string | null;
  booking_id: string | null;
  large_project_id?: string | null;
  title: string;
  booking_number: string | null;
  client: string | null;
  phase: string | null;
  date: string;
  start_time: string;
  end_time: string;
  address: string | null;
  assigned_staff?: Array<{ staff_id: string; staff_name: string; role: string | null; team_id: string | null }>;
  assigned_staff_count: number;
  required_staff_count: number | null;
  staffing_status: 'unstaffed' | 'partial' | 'staffed' | 'unknown';
  jobActivity?: {
    has_started: boolean;
    started_at: string | null;
    latest_activity_at: string | null;
    on_site_minutes: number;
    active_staff_count: number;
    active_staff: Array<{ staff_id: string; name: string; since: string; status: 'on_site' | 'timer_active' | 'signal_lost' | 'left' }>;
    timeline: Array<{ type: 'arrival' | 'timer_start' | 'on_site' | 'left' | 'travel' | 'timer_stop'; at: string; staff_id: string; staff_name: string; label: string; status: string }>;
  };
}
export interface OpsStaffStatus {
  staff_id: string;
  name: string;
  planned_targets: Array<{
    target_type?: string; target_id?: string; target_name?: string;
    date: string; phase?: string;
    planned_start?: string; planned_end?: string; address?: string | null;
  }>;
  has_open_workday: boolean;
  workday_started_at?: string | null;
  active_timer: { id: string; target_type: string; target_id: string | null; target_label?: string | null; started_at: string } | null;
  active_timer_label?: string | null;
  current_status?: 'planned_not_started' | 'on_project' | 'on_location' | 'traveling' | 'active_timer' | 'signal_lost' | 'missing_workday' | 'unknown';
  current_target_type?: string | null;
  current_target_id?: string | null;
  current_target_label?: string | null;
  current_target_address?: string | null;
  current_since?: string | null;
  elapsed_minutes?: number | null;
  latest_known_location: { latitude: number; longitude: number; accuracy: number | null; updated_at: string } | null;
  gps_status: 'live' | 'recent' | 'stale' | 'unknown';
  map_url?: string | null;
  anomaly_count: number;
}
export interface OpsAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  staff_id: string | null;
  target_id: string | null;
  label: string;
  action: string | null;
  date?: string;
}
export interface OpsOverviewPayload {
  jobs: OpsOverviewJob[];
  assignments: OverviewAssignment[];
  staffStatus: OpsStaffStatus[];
  anomalies: OpsAnomaly[];
  messageThreads: OverviewThread[];
  summary: {
    jobs_today: number;
    planned_staff: number;
    active_workdays: number;
    missing_workdays: number;
    unstaffed_jobs: number;
    unread_threads: number;
  };
  from: string;
  to: string;
  mode: 'day' | 'week';
  server_time: string;
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

export interface ScheduledShift {
  shift_id: string;
  booking_id: string;
  booking_number: string | null;
  title: string;
  event_type: 'rig' | 'event' | 'rigdown' | 'other';
  start_time: string; // ISO
  end_time: string;   // ISO
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  client: string;
  is_internal: boolean;
  internal_type: string | null;
  large_project_id: string | null;
  large_project_name: string | null;
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
  // Login / me can take longer due to edge-function cold starts
  const timeoutMs = (action === 'login' || action === 'me') ? 30000 : 15000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const isNative = typeof (window as any)?.Capacitor !== 'undefined';
  // Routa login till den lilla mobile-app-auth-funktionen (snabb cold start).
  // Alla andra actions går till mobile-app-api som vanligt.
  const url = action === 'login' ? LOGIN_FUNCTION_URL : FUNCTION_URL;
  console.log(`[mobileApi] → ${action} (timeout: ${timeoutMs}ms, native: ${isNative}, url: ${url})`);

  // Build headers. When there is no mobile token (web/admin caller), forward
  // the Supabase web JWT so the edge function can verify the user via getClaims().
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!token) {
    try {
      // Lazy import to avoid bundling supabase client into the mobile path twice.
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (e) {
      console.warn('[mobileApi] Could not attach web JWT:', e);
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, token, data }),
      signal: controller.signal,
    });

    console.log(`[mobileApi] ← ${action} status=${res.status}`);

    // Sliding session: if the server rotated our token, update localStorage
    // transparently. UI never sees this — user stays logged in seamlessly.
    try {
      const newToken = res.headers.get('X-New-Token');
      if (newToken && newToken !== token) {
        localStorage.setItem(TOKEN_KEY, newToken);
        console.log(`[mobileApi] 🔄 token rotated by server (action=${action})`);
      }
    } catch (e) {
      console.warn('[mobileApi] Could not read X-New-Token header:', e);
    }

    if (res.status === 401) {
      // Only clear mobile auth if we were using the mobile token.
      if (token) {
        clearAuth();
        // Notify app so any active mobile session can redirect to login
        window.dispatchEvent(new CustomEvent('mobile-session-expired'));
      }
      // Use AbortError so React Query / global error overlays ignore it silently.
      // A stale mobile token in a web session is expected and must not surface
      // as a runtime error.
      const err: any = new DOMException('Session expired', 'AbortError');
      err.code = 'SESSION_EXPIRED';
      err.silent = true;
      throw err;
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`Servern svarade med status ${res.status} men ogiltigt svar.`);
    }

    if (!res.ok) {
      throw new Error(json.error || `Serverfel (${res.status})`);
    }

    return json as T;
  } catch (error: any) {
    console.error(`[mobileApi] ✗ ${action}:`, error?.name, error?.message, error?.cause, 'constructor:', error?.constructor?.name, 'stack:', error?.stack?.substring?.(0, 300));
    if (error?.name === 'AbortError') {
      throw new Error('Anropet tog för lång tid – kontrollera din anslutning och försök igen.');
    }
    // Catch all network-level errors (TypeError in browsers, other errors in WebView)
    if (error instanceof TypeError) {
      throw new Error(`Kunde inte nå servern: ${error.message}`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// ── assistant-events caller ────────────────────────────────────────────────
// Anropar den dedikerade `assistant-events`-edge-functionen. Använder samma
// mobile token (Bearer) som mobile-app-api. Skiljer sig från callApi i att
// den postar `{ action, data }` (utan token i body — auth via header).
async function callAssistantEvents<T = any>(action: string, data?: any): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error('Mobile session required for assistant-events');
  }
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(ASSISTANT_EVENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, data: data ?? {} }),
      signal: controller.signal,
    });
    let json: any;
    try { json = await res.json(); } catch {
      throw new Error(`assistant-events: status ${res.status} men ogiltigt svar`);
    }
    if (!res.ok) {
      throw new Error(json?.error || `assistant-events fel (${res.status})`);
    }
    return json as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('assistant-events timeout');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}


export const mobileApi = {
  login: (email: string, password: string) =>
    callApi<{ success: boolean; token: string; staff: MobileStaff }>('login', { email, password }),

  me: () => callApi<{ staff: MobileStaff }>('me'),

  getBookings: () => callApi<{ bookings: MobileBooking[]; shifts?: ScheduledShift[] }>('get_bookings'),

  getInboxJobs: () => callApi<{ bookings: { id: string; client: string; status: string; rigdaydate: string | null; eventdate: string | null; rigdowndate: string | null }[] }>('get_inbox_jobs'),

  getInboxAll: () => callApi<{ conversations: any[]; broadcasts: any[]; bookings: any[] }>('get_inbox_all'),

  getBookingDetails: (bookingId: string) =>
    callApi<{ booking: any; planning?: any; project?: any; my_time_reports?: any[]; establishment_tasks?: any[] }>('get_booking_details', { booking_id: bookingId }),

  getTimeReports: () => callApi<{ time_reports: MobileTimeReport[] }>('get_time_reports'),

  createTimeReport: (data: {
    booking_id?: string;
    report_date: string;
    start_time?: string;
    end_time?: string;
    hours_worked: number;
    overtime_hours?: number;
    break_time?: number;
    description?: string;
    establishment_task_id?: string;
    large_project_id?: string;
    /** True when this row is a per-address breakdown of a large_project total. */
    is_subdivision?: boolean;
    /** Required when is_subdivision=true. The parent project-total time_report id. */
    parent_time_report_id?: string;
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

  // === Admin / web-only endpoints ===
  // These require the caller to be an authenticated web user with the
  // 'admin' or 'projekt' app_role. They write time_reports on behalf of
  // another staff member (target_staff_id) using the same validation rules
  // as the mobile create/delete handlers.
  adminCreateTimeReport: (data: {
    target_staff_id: string;
    booking_id?: string;
    large_project_id?: string;
    report_date: string;
    start_time: string;
    end_time: string;
    overtime_hours?: number;
    break_time?: number;
    description?: string;
    establishment_task_id?: string;
  }) => callApi<{ success: boolean; time_report: any }>('admin_create_time_report', data),

  adminDeleteTimeReport: (timeReportId: string) =>
    callApi<{ success: boolean }>('admin_delete_time_report', { time_report_id: timeReportId }),

  adminUpdateTimeReport: (data: {
    time_report_id: string;
    start_time?: string | null;
    end_time?: string | null;
    overtime_hours?: number;
    break_time?: number;
    description?: string | null;
    /** Bypass approved-lock and overlap-check (admin override). Logged in audit trail. */
    force?: boolean;
  }) => callApi<{ success: boolean; time_report: any }>('admin_update_time_report', data),

  adminCloseOpenEntry: (data: {
    table: 'location_time_entries' | 'travel_time_logs';
    id: string;
    end_iso: string;
  }) => callApi<{ success: boolean }>('admin_close_open_entry', data),

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

  sendDirectMessage: (data: { recipient_id: string; content: string; file_url?: string; file_name?: string; file_type?: string; booking_id?: string }) =>
    callApi<{ success: boolean; message: any }>('send_direct_message', data),

  markDMRead: (senderId: string) =>
    callApi<{ success: boolean }>('mark_dm_read', { sender_id: senderId }),

  archiveDM: (partnerId: string) =>
    callApi<{ success: boolean; archived_count: number }>('archive_dm', { partner_id: partnerId }),

  unarchiveDM: (partnerId: string) =>
    callApi<{ success: boolean; unarchived_count: number }>('unarchive_dm', { partner_id: partnerId }),

  uploadChatAttachment: (data: { file_name: string; file_type: string; file_data_base64: string }) =>
    callApi<{ success: boolean; url: string; file_name: string; file_type: string | null }>('upload_chat_attachment', data),

  // Job chat — cursor-paginated. Pass `before` (ISO created_at) to load older.
  getJobMessages: (bookingId: string, opts?: { before?: string; limit?: number }) =>
    callApi<{ messages: any[]; has_more: boolean; next_cursor: string | null }>(
      'get_job_messages',
      { booking_id: bookingId, before: opts?.before, limit: opts?.limit },
    ),

  // DM thread (paginated). Distinct from get_direct_messages, which is the inbox aggregator.
  getDMThread: (partnerId: string, opts?: { before?: string; limit?: number }) =>
    callApi<{ messages: any[]; has_more: boolean; next_cursor: string | null }>(
      'get_dm_thread',
      { partner_id: partnerId, before: opts?.before, limit: opts?.limit },
    ),

  getJobParticipants: (bookingId: string, date: string) =>
    callApi<{ participants: { id: string; name: string; role: string }[] }>('get_job_participants', { booking_id: bookingId, date }),

  getDMInboxGrouped: () =>
    callApi<{ conversations: any[] }>('get_dm_inbox_grouped'),

  getUnreadDMCount: () =>
    callApi<{ count: number }>('get_unread_dm_count'),

  getRecentBroadcasts: () =>
    callApi<{ broadcasts: any[] }>('get_recent_broadcasts'),

  // Aggregated messaging activity (DMs + broadcasts + job messages) for dashboards.
  // Official path for any admin/staff dashboard activity feeds — replaces direct
  // frontend reads from direct_messages / broadcast_messages / job_messages.
  getMessagingActivity: (opts?: { since_hours?: number; limit_per_kind?: number }) =>
    callApi<{
      direct_messages: Array<{ id: string; sender_name: string; recipient_name: string; content: string; created_at: string; sender_type: string; file_name?: string | null; file_type?: string | null }>;
      broadcasts: Array<{ id: string; sender_name: string; content: string; category: string; audience: string; created_at: string }>;
      job_messages: Array<{ id: string; sender_name: string; content: string; booking_id: string; created_at: string; file_name?: string | null; file_type?: string | null; bookings?: { client: string } | null }>;
    }>('get_messaging_activity', opts || {}),

  sendJobMessage: (data: { booking_id: string; content: string; file_url?: string; file_name?: string; file_type?: string }) =>
    callApi<{ success: boolean; message: any }>('send_job_message', data),

  markJobRead: (bookingId: string) =>
    callApi<{ success: boolean; updated: number }>('mark_job_read', { booking_id: bookingId }),

  archiveJobConversation: (bookingId: string) =>
    callApi<{ success: boolean; archived_count: number }>('archive_job_conversation', { booking_id: bookingId }),

  unarchiveJobConversation: (bookingId: string) =>
    callApi<{ success: boolean; unarchived_count: number }>('unarchive_job_conversation', { booking_id: bookingId }),

  // === Planner Overview (gated to is_planner === true) ===
  getOverviewCalendar: (opts?: { from?: string; to?: string }) =>
    callApi<{ events: OverviewCalendarEvent[] }>('get_overview_calendar', opts || {}),

  getOverviewAssignments: (opts?: { from?: string; to?: string }) =>
    callApi<{ assignments: OverviewAssignment[] }>('get_overview_assignments', opts || {}),

  getOverviewThreads: () =>
    callApi<{ threads: OverviewThread[] }>('get_overview_threads'),

  getOpsOverview: (opts?: { from?: string; to?: string; mode?: 'day' | 'week'; include_anomalies?: boolean }) =>
    callApi<OpsOverviewPayload>('get_ops_overview', opts || {}),

  // Broadcasts
  getBroadcasts: () =>
    callApi<{ broadcasts: any[] }>('get_broadcasts'),

  sendBroadcast: (data: {
    content: string;
    audience: 'all_today' | 'job_staff' | 'active_staff' | 'selected_staff';
    category?: 'info' | 'weather' | 'schedule' | 'logistics' | 'urgent';
    audience_booking_id?: string | null;
    audience_staff_ids?: string[] | null;
    sender_name?: string;
  }) => callApi<{ success: boolean; broadcast: any }>('send_broadcast', data),

  markBroadcastRead: (broadcastId: string) =>
    callApi<{ success: boolean }>('mark_broadcast_read', { broadcast_id: broadcastId }),

  // Push notifications
  registerPushToken: (pushToken: string, platform?: string) =>
    callApi<{ success: boolean }>('register_push_token', {
      push_token: pushToken,
      platform: platform || (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'),
    }),

  unregisterPushToken: (pushToken: string) =>
    callApi<{ success: boolean }>('unregister_push_token', { push_token: pushToken }),

  // Location reporting
  reportLocation: async (data: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
  }) => {
    const { getAppMeta } = await import('./appMeta');
    const meta = await getAppMeta();
    return callApi<{ success: boolean; at_location?: { id: string; name: string } | null }>(
      'report_location',
      { ...data, ...meta },
    );
  },

  // Batch upload of GPS points from the offline-first sync queue.
  // Each point carries its own client id + recordedAt so the server can
  // dedupe and the client can drop confirmed points from local storage.
  // App version metadata is sent at the top level (not per-point) since it
  // describes the device, not the GPS sample.
  uploadLocationBatch: async (points: Array<{
    id: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    source: string;
    recordedAt: string;
    // Battery diagnostics — all optional, server tolerates missing fields.
    batteryLevel?: number | null;
    batteryPercent?: number | null;
    isCharging?: boolean | null;
    batteryCapturedAt?: string | null;
    batterySource?: string | null;
  }>) => {
    const { getAppMeta } = await import('./appMeta');
    const { getAppBuildInfo } = await import('@/lib/mobile/getAppBuildInfo');
    const [meta, build] = await Promise.all([getAppMeta(), getAppBuildInfo()]);
    return callApi<{
      success: boolean;
      accepted: string[];
      rejected: { id: string; reason: string }[];
      received: number;
    }>('upload_location_batch', {
      points,
      // Legacy fält (staff_locations använder dem fortfarande).
      ...meta,
      // Utökad app-byggnadsinfo som persisteras på varje staff_location_history-rad
      // så vi kan se exakt vilken version som postade en given GPS-ping.
      app_version: build.appVersion ?? meta.app_version ?? null,
      app_build: build.appBuild ?? null,
      app_platform: build.platform ?? meta.app_platform ?? null,
      os_version: build.osVersion ?? null,
      device_model: build.deviceModel ?? null,
      app_id: build.appId ?? null,
    });
  },

  // Organization locations (fixed places)
  getOrganizationLocations: () =>
    callApi<{ locations: { id: string; name: string; address: string | null; latitude: number; longitude: number; radius_meters: number; show_as_project?: boolean }[] }>('get_organization_locations'),

  // LEGACY COMPATIBILITY ONLY.
  // New Time app code MUST use `startTimeRegistration` (below) — these
  // wrappers exist solely so legacy callers (timerSyncQueue, useWorkSession,
  // useGeofencing) keep working while they are migrated.
  startLocationTimer: async (params: {
    location_id?: string;
    booking_id?: string;
    large_project_id?: string;
    task_id?: string;
    started_at?: string;
    client_dedupe_key?: string;
  }) => {
    let target_type: 'large_project' | 'booking' | 'location' | null = null;
    let target_id: string | null = null;
    if (params.large_project_id) { target_type = 'large_project'; target_id = params.large_project_id; }
    else if (params.booking_id)  { target_type = 'booking';       target_id = params.booking_id; }
    else if (params.location_id) { target_type = 'location';      target_id = params.location_id; }
    const res = await callApi<{
      success?: boolean;
      registration: any;
    }>('start_time_registration', { target_type, target_id, started_at: params.started_at });
    const reg = res?.registration ?? null;
    return {
      success: res?.success,
      already_active: false as boolean,
      idempotent: false as boolean,
      status: undefined as 'already_closed_or_consumed' | undefined,
      reason: undefined as 'already_closed' | 'already_consumed' | undefined,
      entry: reg
        ? { ...reg, entered_at: reg.started_at ?? reg.entered_at }
        : null,
    };
  },


  // Lager (internal Lager project) tasks
  getLagerTasks: () =>
    callApi<{ project: { id: string; name: string } | null; my_tasks: any[]; open_tasks: any[] }>('get_lager_tasks'),

  getLagerAssignments: (data?: { date_from?: string; date_to?: string }) =>
    callApi<{
      assignments: Array<{
        id: string;
        type: 'packing' | 'return' | 'inventory' | 'internal_task' | 'other';
        title: string;
        description: string | null;
        date: string | null;
        start_time: string | null;
        end_time: string | null;
        status: string;
        action: 'open_scanner' | 'open_return_scanner' | 'open_inventory' | 'complete_task' | 'open_details';
        packing_id: string | null;
        packlist_id: string | null;
        booking_id: string | null;
        booking_number: string | null;
        delivery_address: string | null;
        customer_name: string | null;
        project_task_id: string | null;
        warehouse_event_id: string | null;
        source: string;
        metadata: Record<string, unknown> | null;
        // Back-compat (older mobile builds):
        event_type?: string;
        assignment_type?: 'packing' | 'return' | 'inventory' | 'internal_task' | 'other';
        completed?: boolean;
      }>;
      summary: {
        has_warehouse_work: boolean;
        assignment_count: number;
        canonical_count?: number;
        first_start_time: string | null;
        last_end_time: string | null;
        types: Array<'packing' | 'return' | 'inventory' | 'internal_task' | 'other'>;
      };
    }>('get_lager_assignments', data),

  createLagerTask: (data: { title: string; description?: string; deadline?: string; assign_to_me?: boolean }) =>
    callApi<{ success: boolean; task: any }>('create_lager_task', data),

  completeLagerTask: (data: { task_id: string; completed?: boolean }) =>
    callApi<{ success: boolean; task: any }>('complete_lager_task', data),

  claimLagerTask: (data: { task_id: string }) =>
    callApi<{ success: boolean; task: any }>('claim_lager_task', data),

  // Lager team / purchases / files
  getLagerTeam: () =>
    callApi<{ team: { id: string; name: string; phone: string | null; email: string | null; role: string | null; color: string | null }[] }>('get_lager_team'),

  getLagerPurchases: () =>
    callApi<{ purchases: MobilePurchase[] }>('get_lager_purchases'),

  createLagerPurchase: (data: { description: string; amount: number; supplier?: string; receipt_image?: string }) =>
    callApi<{ success: boolean; purchase: any }>('create_lager_purchase', data),

  getLagerFiles: () =>
    callApi<{ files: any[] }>('get_lager_files'),

  uploadLagerFile: (data: { file_name: string; file_data: string; file_type: string }) =>
    callApi<{ success: boolean; file: any }>('upload_lager_file', data),

  // LEGACY COMPATIBILITY ONLY. Use `stopTimeRegistration` in new Time app code.
  stopLocationTimer: async (data: { location_id?: string; booking_id?: string; large_project_id?: string; entry_id?: string; stop_source?: string; stopped_at?: string }) => {
    const res = await callApi<{ success?: boolean; registration: any }>('stop_time_registration', {
      registration_id: data.entry_id ?? null,
      stop_source: data.stop_source ?? 'user_manual',
      stopped_at: data.stopped_at,
    });
    const reg = res?.registration ?? null;
    return { success: res?.success, entry: reg };
  },

  // ===================================================================
  // Time Engine v2 — canonical timer API. New Time app code MUST use these.
  // ===================================================================

  /**
   * Start an active time registration (Time Engine v2). Writes ONLY to
   * `active_time_registrations` — never workday / LTE / time_reports / travel.
   */
  startTimeRegistration: async (data?: {
    target_type?: 'booking' | 'large_project' | 'project' | 'location';
    target_id?: string;
    started_at?: string;
  }) =>
    callApi<{ success?: boolean; registration: any }>('start_time_registration', {
      target_type: data?.target_type ?? null,
      target_id: data?.target_id ?? null,
      started_at: data?.started_at,
    }),

  /** Stop the current active time registration (Time Engine v2). */
  stopTimeRegistration: async (data?: {
    registration_id?: string;
    stopped_at?: string;
    stop_source?: string;
  }) =>
    callApi<{ success?: boolean; registration: any }>('stop_time_registration', {
      registration_id: data?.registration_id ?? null,
      stopped_at: data?.stopped_at,
      stop_source: data?.stop_source ?? 'user_manual',
    }),

  /**
   * Canonical timer status read. Uses callStaffSnapshotFunction so mobile-
   * token auth works the same as get-staff-day-status.
   */
  getActiveTimeRegistrationStatus: async () => {
    const { callStaffSnapshotFunction } = await import('@/services/staffSnapshotApi');
    return callStaffSnapshotFunction<any>('get-active-time-registration-status', {});
  },

  /** Per-target time segments for a registration / day. */
  getTimerTimeSegments: async (data?: { registration_id?: string; date?: string }) => {
    const { callStaffSnapshotFunction } = await import('@/services/staffSnapshotApi');
    return callStaffSnapshotFunction<any>('get-timer-time-segments', {
      registration_id: data?.registration_id ?? null,
      date: data?.date ?? null,
    });
  },

  /**
   * LEGACY ONLY (admin / historik / banner-cleanup).
   * Do not use as active timer logic in the new Time app — use
   * `stopLocationTimer` (→ stop_time_registration) instead. Operates on legacy
   * `location_time_entries` rows.
   */
  stopOpenEntryLegacy: (data: {
    entry_id: string;
    stop_at?: string;
    stop_source?: string;
    stop_reason?: string;
    skip_time_report?: boolean;
    break_time?: number;
  }) =>
    callApi<{
      success: boolean;
      entry: any;
      created_time_report_id: string | null;
      active_day_state: any;
      already_closed?: boolean;
    }>('stop_open_entry', data),

  dismissLocationEntry: (locationId: string) =>
    callApi<{ success?: boolean }>('dismiss_location_entry', { location_id: locationId }),

  /**
   * LEGACY ONLY (admin / historik). Reads `location_time_entries`.
   * Do not use for active timer state — use the get-current-time-registration /
   * get-active-time-registration-status / get-timer-time-segments edge
   * functions instead.
   */
  getLocationTimeEntriesLegacy: (data?: { date_from?: string; date_to?: string; limit?: number }) =>
    callApi<{ entries: any[] }>('get_location_time_entries', data),

  /**
   * LEGACY ONLY (admin / historik / day reconciliation banner).
   * Do not use as the active timer source in the new Time app — use the
   * get-current-time-registration / get-active-time-registration-status
   * edge functions instead.
   */
  getActiveDayStateLegacy: () =>
    callApi<{
      workday: { id: string; started_at: string; ended_at: string | null; review_status: string | null } | null;
      open_entries: Array<{
        id: string;
        target_kind: 'location' | 'booking' | 'large_project' | 'unknown';
        target_id: string | null;
        target_label: string;
        entered_at: string;
        source: string | null;
      }>;
      latest_ping: { latitude: number | null; longitude: number | null; accuracy: number | null; updated_at: string } | null;
      latest_ping_age_ms: number | null;
      stale_ping: boolean;
      anomalies: any[];
      server_time: string;
    }>('get_active_day_state', {}),

  // ===== Anomalies (background absence tracking) =====
  startAnomaly: (data: { location_id?: string; booking_id?: string; large_project_id?: string; started_at?: string }) =>
    callApi<{ success: boolean; anomaly: any; already_open?: boolean }>('start_anomaly', data),

  stopAnomaly: (data: { location_id?: string; booking_id?: string; anomaly_id?: string; ended_at?: string }) =>
    callApi<{ success: boolean; anomaly?: any; no_open?: boolean; discarded?: boolean }>('stop_anomaly', data),

  listPendingAnomalies: () =>
    callApi<{ anomalies: Array<{
      id: string;
      location_id: string | null;
      booking_id: string | null;
      large_project_id: string | null;
      location_name: string | null;
      started_at: string;
      ended_at: string;
      duration_minutes: number;
      classification: 'break' | 'work' | null;
      work_description: string | null;
      time_report_id: string | null;
    }> }>('list_pending_anomalies'),

  classifyAnomaly: (data: { anomaly_id: string; classification: 'break' | 'work'; work_description?: string }) =>
    callApi<{ success: boolean; anomaly: any }>('classify_anomaly', data),

  closeOpenAnomalies: (data?: { ended_at?: string }) =>
    callApi<{ success: boolean; closed: number; discarded: number }>('close_open_anomalies', data || {}),

  getLastWorkplaceExit: () =>
    callApi<{ last_exit: { exited_at: string; location_id: string | null; location_name: string | null } | null }>('get_last_workplace_exit'),

  createEndOfDayAnomaly: (data: {
    started_at: string;
    ended_at: string;
    work_description?: string;
    end_location_lat?: number;
    end_location_lng?: number;
    location_id?: string;
    booking_id?: string;
    large_project_id?: string;
    time_report_id?: string;
  }) => callApi<{ success: boolean; anomaly: any }>('create_end_of_day_anomaly', data),

  // GPS history lookups
  getPositionAtTime: (at: string) =>
    callApi<{ position: { lat: number; lng: number; accuracy: number | null; recorded_at: string } | null }>('get_position_at_time', { at }),

  getMovementForDay: (staffId: string, date: string) =>
    callApi<{ points: { lat: number; lng: number; accuracy: number | null; speed: number | null; recorded_at: string; battery_percent?: number | null; source?: string | null }[] }>('get_movement_for_day', { staff_id: staffId, date }),

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
    /**
     * If true, the server records this travel log as 'work' (billable)
     * even when the destination doesn't match a known booking. Pass this
     * when the stop is the result of an explicit user action (e.g. manual
     * stop button or "Detta var arbetsresa" in TravelCompletedDialog).
     */
    mark_payable?: boolean;
  }) => callApi<{ success: boolean; travel_log: any }>('stop_travel_log', data),

  updateTravelLog: (data: {
    travel_log_id: string;
    description?: string;
    manual_project_name?: string;
  }) => callApi<{ success: boolean; travel_log: any }>('update_travel_log', data),

  /**
   * Set semantic classification for an existing travel log. Pure label —
   * does not change hours_worked. Used by TravelCompletedDialog and the
   * admin "follow up unclassified travel" flow.
   */
  classifyTravelLog: (data: {
    travel_log_id: string;
    classification: 'work' | 'personal' | 'unclassified';
  }) => callApi<{ success: boolean; travel_log: any }>('classify_travel_log', data),

  getTravelLogs: (limit?: number) =>
    callApi<{ travel_logs: MobileTravelLog[] }>('get_travel_logs', { limit }),

  getContacts: () =>
    callApi<{ contacts: { id: string; name: string; type: string }[] }>('get_contacts'),

  toggleEstablishmentTask: (taskId: string) =>
    callApi<{ success: boolean; completed: boolean }>('toggle_establishment_task', { task_id: taskId }),

  // Arrival prompt — UNIFIED across location/project/booking targets.
  // Server returns BOTH the new generic `target` shape and (for legacy
  // location-only callers) the deprecated `location_id` / `location_name`
  // fields. New code should read `target`.
  getArrivalState: () =>
    callApi<{
      should_prompt: boolean;
      target: {
        kind: 'location' | 'project' | 'booking';
        target_id: string;
        label: string;
        arrived_at: string;
        address?: string | null;
      } | null;
      prompts_sent: number;
      // legacy mirror — location only
      arrived_at: string | null;
      location_id: string | null;
      location_name: string | null;
    }>('get_arrival_state'),

  // Accepts BOTH the new generic shape and the legacy location-only shape.
  markArrivalResolved: (data:
    | { target_type: 'location' | 'project' | 'booking'; target_id: string; arrived_at: string }
    | { location_id: string; arrived_at: string }
  ) => callApi<{ success: boolean }>('mark_arrival_resolved', data),

  /**
   * Register a generic arrival signal on the server. Idempotent on
   * (staff, target, ~arrived_at). Use this from the geofence enter handler
   * for project/booking arrivals so the server-side prompt logic and
   * push-cron see the arrival exactly as they see fixed-location arrivals.
   */
  reportArrival: (data: {
    kind: 'location' | 'project' | 'booking';
    target_id: string;
    arrived_at?: string;
  }) => callApi<{ success: boolean; arrival: any; idempotent?: boolean }>('report_arrival', data),

  /**
   * Report a departure from a target the staff member dwelled at for ≥5 min.
   * Pure assistant signal — never stops a timer or creates a time_report.
   * Server writes an `assistant_events` row with suggested_action='end_activity'.
   */
  reportDeparture: (data: {
    kind: 'location' | 'project' | 'booking';
    target_id: string;
    target_label?: string | null;
    departed_at?: string;
    dwell_minutes?: number;
  }) => callApi<{ success: boolean }>('report_departure', data),

  /**
   * Report arrival at the user's home location. Server writes an
   * `assistant_events` row with suggested_action='end_workday'. No auto-stop.
   */
  reportHomeArrival: (data?: { arrived_at?: string }) =>
    callApi<{ success: boolean }>('report_home_arrival', data ?? {}),

  // ── Assistant Events (Runda 1b) ────────────────────────────────────
  // Direct calls against the dedicated `assistant-events` edge function.
  // List/resolve flows for the new event-driven assistant model.
  assistantEvents: {
    listPending: () => callAssistantEvents<{ events: any[] }>('list_pending'),
    listReview: (sinceIso?: string) =>
      callAssistantEvents<{ events: any[] }>('list_review', sinceIso ? { since: sinceIso } : {}),
    create: (data: {
      event_type: 'arrival' | 'departure' | 'home_arrival' | 'travel_edge';
      target_type: 'location' | 'project' | 'booking' | 'home' | 'unknown';
      target_id?: string | null;
      target_label?: string | null;
      target_address?: string | null;
      happened_at?: string;
      source?: string;
      suggested_action?: string;
      metadata?: Record<string, unknown>;
    }) => callAssistantEvents<{ event: any; idempotent?: boolean }>('create_event', data),
    resolve: (data: {
      event_id: string;
      resolution_status:
        | 'applied_from_event_time'
        | 'applied_from_now'
        | 'applied_from_custom_time'
        | 'dismissed'
        | 'merged_into_other_event'
        | 'auto_closed_by_later_action'
        | 'ignored_stale';
      resolution_notes?: string;
      linked_workday_id?: string;
      linked_time_report_id?: string;
      linked_travel_log_id?: string;
      merged_into_event_id?: string;
      keep_for_review?: boolean;
    }) => callAssistantEvents<{ event: any }>('resolve_event', data),
    markStale: (eventId: string) =>
      callAssistantEvents<{ event: any }>('mark_stale', { event_id: eventId }),
  },

  // ── Workday flags (PROMPT 6 — anomaly model v2) ─────────────────────
  // Workday flags are the first-class store for "system saw something it
  // can't safely decide on its own". They never modify reported time —
  // they only annotate, prompt the staff member, and let admins follow up.
  // See workday_flags migration for the full vocabulary.
  createWorkdayFlag: (data: {
    flag_type: WorkdayFlagType;
    flag_date: string; // YYYY-MM-DD
    title: string;
    description?: string;
    severity?: 'info' | 'warning' | 'error';
    needs_user_input?: boolean;
    assistant_decision_kind?: string;
    related_time_report_id?: string;
    related_booking_id?: string;
    related_large_project_id?: string;
    related_location_id?: string;
    related_anomaly_id?: string;
    context?: Record<string, unknown>;
  }) => callApi<{ success: boolean; flag: WorkdayFlag }>('create_workday_flag', data),

  listWorkdayFlags: (params?: { resolved?: boolean; limit?: number }) =>
    callApi<{ flags: WorkdayFlag[] }>('list_workday_flags', params || {}),

  // Day-review entrypoint — returnerar workdays + per-dag aggregat över
  // assistant_events och oklara resor. Default 7 dagar bakåt.
  listWorkdaysReview: (params?: { days?: number }) =>
    callApi<{
      workdays: Array<{
        id: string;
        started_at: string;
        ended_at: string | null;
        review_status: 'draft' | 'needs_review' | 'ready' | 'approved';
        review_reasons: string[];
        review_computed_at: string | null;
        notes: string | null;
        day_key: string;
        counts: { open_events: number; stale_review_events: number; open_travel: number };
        events_for_day: Array<{
          id: string;
          happened_at: string;
          event_type: string;
          target_label: string | null;
          target_type: string | null;
          target_id: string | null;
          resolution_status: string;
          stale_for_prompt: boolean;
          still_relevant_for_review: boolean;
          suggested_action: string;
          metadata?: Record<string, unknown>;
        }>;
        travels_for_day: Array<{
          id: string;
          start_time: string;
          end_time: string | null;
          classification: string | null;
        }>;
      }>;
    }>('list_workdays_review', params || {}),

  // Justera tider på en travel_time_log i efterhand (review-flöde).
  setTravelTimes: (data: { travel_log_id: string; start_time: string; end_time?: string }) =>
    callApi<{ success: boolean; travel_log: any }>('set_travel_times', data),

  /**
   * Skapa restid från ett gap mellan två arbetsaktiviteter.
   * Servern är idempotent på (staff, start, end, source='gap_derived'),
   * applicerar tröskelregler (10–180 min = work, >180 min = needs_review)
   * och vägrar cross-day. Returnerar `deduplicated:true` om gapet redan
   * fanns sparat.
   */
  createTravelFromGap: (data: {
    previous_target_type: 'project' | 'booking' | 'location';
    previous_target_id: string;
    previous_target_label?: string;
    next_target_type: 'project' | 'booking' | 'location';
    next_target_id: string;
    next_target_label?: string;
    start_time: string;
    end_time: string;
  }) =>
    callApi<{
      success?: boolean;
      skipped?: boolean;
      deduplicated?: boolean;
      gap_minutes?: number;
      needs_review?: boolean;
      reason?: string;
      travel_log?: any;
    }>('create_travel_from_gap', data),

  // Markera arbetsdagen godkänd. Trigger respekterar approved och skriver
  // inte över statusen vid efterföljande recompute.
  approveWorkday: (workday_id: string) =>
    callApi<{ success: boolean; workday: any }>('approve_workday', { workday_id }),

  resolveWorkdayFlag: (data: {
    flag_id: string;
    resolution_source: 'staff' | 'admin' | 'auto';
    resolution_note?: string;
  }) => callApi<{ success: boolean; flag: WorkdayFlag }>('resolve_workday_flag', data),

  // ── Admin day-review actions ──
  adminSetWorkdayReview: (data: {
    workday_id: string;
    status: 'approved' | 'needs_review' | 'returned' | 'ready' | 'draft';
    note?: string;
  }) => callApi<{ workday: { id: string; review_status: string; review_note: string | null } }>(
    'admin_set_workday_review',
    data,
  ),

  adminMarkGapBreak: (data: {
    target_staff_id: string;
    flag_date: string; // YYYY-MM-DD
    start_time: string; // ISO
    end_time: string;   // ISO
    note?: string;
  }) => callApi<{ flag: { id: string } }>('admin_mark_gap_break', data),

  adminMarkGapTravel: (data: {
    target_staff_id: string;
    previous_target_type: 'project' | 'booking' | 'location';
    previous_target_id: string;
    previous_target_label?: string;
    next_target_type: 'project' | 'booking' | 'location';
    next_target_id: string;
    next_target_label?: string;
    start_time: string;
    end_time: string;
  }) => callApi<{
    success?: boolean;
    skipped?: boolean;
    deduplicated?: boolean;
    needs_review?: boolean;
    travel_log?: any;
  }>('admin_mark_gap_travel', data),

  /**
   * admin_approve_day — godkänner hela arbetsdagen för en personal.
   * Cascade-godkänner time_reports + travel_time_logs som ligger i workday-fönstret.
   * `force=true` kräver `override_reason` (>= 3 tecken).
   */
  adminApproveDay: (data: {
    workday_id: string;
    force?: boolean;
    override_reason?: string | null;
  }) => callApi<{
    workday: {
      id: string;
      staff_id: string;
      started_at: string;
      ended_at: string | null;
      review_status: string;
      approved_at: string | null;
      approved_by: string | null;
      approval_override_reason: string | null;
    };
    cascaded_time_reports: number;
    cascaded_travel_logs: number;
    override: boolean;
  }>('admin_approve_day', data),

  adminUnapproveDay: (data: { workday_id: string; note?: string }) =>
    callApi<{ workday: { id: string; review_status: string; approved_at: string | null; approved_by: string | null } }>(
      'admin_unapprove_day',
      data,
    ),

  // Confirm/correct the end-of-day time after the nightly cron auto-closed
  // an abandoned timer. Adjusts the affected entries and resolves the flag.
  correctStaleDayEnd: (data: { flag_id: string; chosen_end_iso: string }) =>
    callApi<{ success: boolean; flag: WorkdayFlag }>('correct_stale_day_end', data),

  // ── Smart-karta (arrival context) ──────────────────────────────────
  acceptUnplannedSiteVisit: (data: {
    suggestion_id?: string;
    travel_log_id?: string;
    booking_id: string;
    note: string;
  }) => callApi<{ success: boolean; entry: any }>('accept_unplanned_site_visit', data),

  endUnplannedSiteVisit: (data: { entry_id: string }) =>
    callApi<{ success: boolean; entry: any }>('end_unplanned_site_visit', data),

  registerBreakFromTravel: (data: { suggestion_id?: string; duration_minutes: number }) =>
    callApi<{ success: boolean; minutes: number; updated_time_report_id: string | null }>(
      'register_break_from_travel',
      data,
    ),

  linkPurchaseIntentToProject: (data: {
    suggestion_id?: string;
    travel_log_id?: string;
    booking_id?: string;
    large_project_id?: string;
    location_id?: string;
    supplier_name?: string;
  }) => callApi<{ success: boolean }>('link_purchase_intent_to_project', data),

  rejectArrivalSuggestion: (data: { suggestion_id: string }) =>
    callApi<{ success: boolean }>('reject_arrival_suggestion', data),

  /**
   * Calls the dedicated classify-arrival-context edge function.
   * Returns kind='unknown' on any error so the caller can fall back silently.
   */
  classifyArrivalContext: async (data: {
    travel_log_id?: string | null;
    lat: number;
    lng: number;
    arrived_at?: string;
    to_address?: string | null;
  }) => {
    try {
      const staffRaw = localStorage.getItem(STAFF_KEY);
      const staff = staffRaw ? JSON.parse(staffRaw) : null;
      const token = localStorage.getItem(TOKEN_KEY);
      if (!staff?.id || !token) {
        return { kind: 'unknown' as const, confidence: 0, payload: {}, suggestion_id: null };
      }
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/classify-arrival-context`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            staff_id: staff.id,
            organization_id: staff.organization_id,
            ...data,
          }),
        },
      );
      if (!res.ok) {
        return { kind: 'unknown' as const, confidence: 0, payload: {}, suggestion_id: null };
      }
      return (await res.json()) as {
        kind: 'unplanned_job_candidate' | 'meal_break' | 'supply_store' | 'unknown';
        confidence: number;
        payload: Record<string, unknown>;
        suggestion_id: string | null;
        suppressed_reason?: string;
      };
    } catch (err) {
      console.warn('[classifyArrivalContext] failed:', err);
      return { kind: 'unknown' as const, confidence: 0, payload: {}, suggestion_id: null };
    }
  },
};

// Workday flag vocabulary mirrored from the migration's CHECK constraint.
export type WorkdayFlagType =
  | 'missing_break'
  | 'unclear_day_end'
  | 'presence_without_report'
  | 'activity_ended_day_continues'
  | 'geofence_presence_mismatch'
  | 'team_time_deviation'
  | 'unreasonable_travel'
  | 'time_gap'
  | 'missing_report'
  | 'long_day'
  | 'overlapping_times'
  | 'home_arrival_end_day_adjusted'
  | 'home_arrival_auto_ended'
  | 'auto_closed_overnight'
  | 'auto_closed_travel'
  | 'auto_closed_report'
  | 'unclear_start_target'
  | 'planned_time_without_signal';

export interface WorkdayFlag {
  id: string;
  organization_id: string;
  staff_id: string;
  flag_type: WorkdayFlagType;
  severity: 'info' | 'warning' | 'error';
  flag_date: string;
  title: string;
  description: string | null;
  needs_user_input: boolean;
  assistant_decision_kind: string | null;
  related_time_report_id: string | null;
  related_booking_id: string | null;
  related_large_project_id: string | null;
  related_location_id: string | null;
  related_anomaly_id: string | null;
  context: Record<string, unknown>;
  resolved: boolean;
  resolved_at: string | null;
  resolution_source: 'staff' | 'admin' | 'auto' | null;
  resolution_note: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}
