import { invokeChat } from '@/lib/chat/invokeChat';

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
 * All job-chat operations route through `mobile-app-api` via the shared
 * `invokeChat` helper. See `directMessageService.ts` header for the full
 * "officiell väg" overview.
 */

/** READ — routed through `mobile-app-api`. */
export const fetchJobMessages = async (bookingId: string): Promise<JobMessage[]> => {
  if (!bookingId) return [];
  try {
    const result = await invokeChat<{ messages: JobMessage[] }>('get_job_messages', {
      booking_id: bookingId,
    });
    return result?.messages || [];
  } catch (err) {
    console.error('Error fetching job messages:', err);
    return [];
  }
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

/** READ — routed through `mobile-app-api`. Backend resolves staff + planners with org isolation. */
export const fetchJobParticipants = async (
  bookingId: string,
  date: string,
): Promise<JobChatParticipant[]> => {
  if (!bookingId) return [];
  try {
    const result = await invokeChat<{ participants: JobChatParticipant[] }>('get_job_participants', {
      booking_id: bookingId,
      date,
    });
    return result?.participants || [];
  } catch (err) {
    console.error('Error fetching job participants:', err);
    return [];
  }
};
