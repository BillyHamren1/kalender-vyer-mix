import { supabase } from '@/integrations/supabase/client';

export interface JobMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  is_archived: boolean;
  is_archived_by?: string[];
  read_by?: string[];
  delivered_at?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  created_at: string;
}

export interface JobChatParticipant {
  id: string;
  name: string;
  role: 'planner' | 'team_leader' | 'staff';
}

/**
 * All chat WRITE operations are routed through the `mobile-app-api` edge function
 * (single backend layer for messaging logic). Reads continue against DB (RLS-protected).
 */
async function invokeChat<T = any>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const { data: result, error } = await supabase.functions.invoke('mobile-app-api', {
    body: { action, data },
  });
  if (error) {
    console.error(`[chat-api] ${action} failed:`, error);
    throw error;
  }
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    console.error(`[chat-api] ${action} returned error:`, result.error);
    throw new Error(String(result.error));
  }
  return result as T;
}

/** READ — direct DB query */
export const fetchJobMessages = async (bookingId: string): Promise<JobMessage[]> => {
  const { data, error } = await supabase
    .from('job_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching job messages:', error);
    return [];
  }
  return (data as JobMessage[]) || [];
};

/**
 * WRITE wrapper — send a job message via mobile-app-api.
 * Backward-compatible: legacy 5-arg form (bookingId, senderId, senderName, senderRole, content)
 * AND new 2-arg form (bookingId, content) both work. sender* args are ignored —
 * identity is resolved server-side from the auth context.
 */
export const sendJobMessage = async (
  bookingId: string,
  contentOrLegacy?: string,
  _legacySenderName?: string,
  _legacySenderRole?: string,
  legacyContent?: string,
  options?: { fileUrl?: string; fileName?: string; fileType?: string },
): Promise<JobMessage | null> => {
  // Support legacy 5-arg form: (bookingId, senderId, senderName, senderRole, content)
  const finalContent = legacyContent !== undefined ? legacyContent : (contentOrLegacy ?? '');
  const result = await invokeChat<{ success: boolean; message: JobMessage }>('send_job_message', {
    booking_id: bookingId,
    content: String(finalContent).trim(),
    file_url: options?.fileUrl,
    file_name: options?.fileName,
    file_type: options?.fileType,
  });
  return result?.message || null;
};

/** WRITE wrapper — mark all messages in a job conversation as read by current user. */
export const markJobRead = async (bookingId: string): Promise<void> => {
  await invokeChat('mark_job_read', { booking_id: bookingId });
};

/** WRITE wrapper — archive an entire job conversation. */
export const archiveJobConversation = async (bookingId: string): Promise<void> => {
  await invokeChat('archive_job_conversation', { booking_id: bookingId });
};

/** READ — direct DB query */
export const fetchJobParticipants = async (bookingId: string, date: string): Promise<JobChatParticipant[]> => {
  const participants: JobChatParticipant[] = [];

  const { data: assignments } = await supabase
    .from('booking_staff_assignments')
    .select('staff_id, team_id')
    .eq('booking_id', bookingId)
    .eq('assignment_date', date);

  if (assignments?.length) {
    const staffIds = [...new Set(assignments.map(a => a.staff_id))];
    const { data: staffData } = await supabase
      .from('staff_members' as any)
      .select('id, name, role')
      .in('id', staffIds);

    for (const s of (staffData || []) as any[]) {
      const isTeamLeader = (s.role || '').toLowerCase().includes('ledare') || (s.role || '').toLowerCase().includes('leader');
      participants.push({
        id: s.id,
        name: s.name,
        role: isTeamLeader ? 'team_leader' : 'staff',
      });
    }
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, full_name, email');

  for (const p of (profiles || [])) {
    participants.push({
      id: p.user_id,
      name: p.full_name || p.email || 'Planerare',
      role: 'planner',
    });
  }

  return participants;
};
