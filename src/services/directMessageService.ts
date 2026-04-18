import { invokeChat } from '@/lib/chat/invokeChat';

export interface DirectMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  recipient_id: string;
  recipient_name: string;
  content: string;
  is_read: boolean;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  booking_id?: string | null;
}

/**
 * All DM operations (read + write) are routed through `mobile-app-api`
 * via the shared `invokeChat` helper. There is no direct DB access from
 * this service — the edge function owns identity resolution and org isolation.
 *
 * Officiell väg per messaging-domän:
 *   - DM            → mobileApi.* / invokeChat('send_direct_message' | 'get_dm_thread' | …)
 *   - Job chat      → mobileApi.* / invokeChat('send_job_message' | 'get_job_messages' | …)
 *   - Inbox         → mobileApi.getInboxAll() (single aggregate, used by both web + mobile)
 *   - Unread        → mobileApi.getUnreadDMCount() / aggregated in getInboxAll
 *   - Attachments   → mobileApi.uploadChatAttachment() / invokeChat('upload_chat_attachment')
 *   - Archive       → invokeChat('archive_dm' | 'archive_job_conversation')
 *   - Contacts      → mobileApi.getContacts() / invokeChat('get_contacts')
 */

/**
 * Fetch conversation between two participants (sorted by time).
 * READ — routed through `mobile-app-api` (single backend layer for messaging).
 * Backend resolves caller identity from auth context and applies org isolation.
 * `allMyIds` is kept for signature compatibility but ignored server-side.
 */
export const fetchDirectMessages = async (
  allMyIds: string[],
  allPartnerIds: string[],
): Promise<DirectMessage[]> => {
  if (allPartnerIds.length === 0) return [];

  try {
    const result = await invokeChat<{ messages: DirectMessage[] }>('get_dm_thread', {
      partner_ids: allPartnerIds,
    });
    return result?.messages || [];
  } catch (err) {
    console.error('Error fetching direct messages:', err);
    return [];
  }
};

/**
 * WRITE wrapper — sends a direct message via mobile-app-api.
 */
export const sendDM = async (
  recipientId: string,
  recipientName: string,
  content: string,
  options?: {
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    bookingId?: string;
  },
): Promise<void> => {
  await invokeChat('send_direct_message', {
    recipient_id: recipientId,
    recipient_name: recipientName,
    content: content.trim(),
    file_url: options?.fileUrl,
    file_name: options?.fileName,
    file_type: options?.fileType,
    booking_id: options?.bookingId,
  });
};

/**
 * Backward-compatible signature kept so existing components don't break.
 * sender* args are ignored — backend resolves identity from auth.
 */
export const sendDirectMessage = async (
  _senderId: string,
  _senderName: string,
  _senderType: 'planner' | 'staff',
  recipientId: string,
  recipientName: string,
  content: string,
  options?: {
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    bookingId?: string;
  },
): Promise<void> => {
  await sendDM(recipientId, recipientName, content, options);
};

/**
 * Upload chat attachment via mobile-app-api → chat-attachments bucket.
 * Returns URL + metadata ready to attach to a DM/job message.
 */
export const uploadChatAttachment = async (
  file: File,
): Promise<{ url: string; path: string; fileName: string; fileType: string }> => {
  const base64 = await fileToBase64(file);
  const result = await invokeChat<{
    success: boolean;
    url: string;
    path: string;
    file_name: string;
    mime_type: string;
  }>('upload_chat_attachment', {
    file_name: file.name,
    file_type: file.type || 'application/octet-stream',
    file_data_base64: base64,
  });
  return {
    url: result.url,
    path: result.path,
    fileName: result.file_name,
    fileType: result.mime_type,
  };
};

/**
 * Backward-compatible alias for components that still call uploadDMFile.
 */
export const uploadDMFile = async (
  file: File,
  _senderId: string,
): Promise<{ url: string; fileName: string; fileType: string }> => {
  const r = await uploadChatAttachment(file);
  return { url: r.url, fileName: r.fileName, fileType: r.fileType };
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64," prefix
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * WRITE wrapper — mark messages from sender as read.
 */
export const markDMRead = async (senderId: string): Promise<void> => {
  await invokeChat('mark_dm_read', { sender_id: senderId });
};

/**
 * Backward-compatible signature.
 */
export const markDirectMessagesRead = async (
  _allMyIds: string[],
  senderId: string,
): Promise<void> => {
  await markDMRead(senderId);
};

/**
 * WRITE wrapper — archive a DM thread for the current user.
 */
export const archiveDM = async (partnerId: string): Promise<void> => {
  await invokeChat('archive_dm', { partner_id: partnerId });
};

/**
 * Get unread DM count for the current user (READ — backend).
 * `allMyIds` kept for signature compatibility; backend uses auth context.
 */
export const fetchUnreadDMCount = async (_allMyIds: string[]): Promise<number> => {
  try {
    const result = await invokeChat<{ count: number }>('get_unread_dm_count');
    return result?.count || 0;
  } catch (err) {
    console.error('Error fetching unread DM count:', err);
    return 0;
  }
};

export interface GroupedConversation {
  recipientId: string;
  recipientName: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
  isSentByMe: boolean;
}

/**
 * Get DM inbox grouped by conversation partner (READ — backend).
 * Backend resolves caller identities from auth and applies org isolation.
 */
export const fetchDMInboxGrouped = async (_allMyIds: string[]): Promise<GroupedConversation[]> => {
  try {
    const result = await invokeChat<{ conversations: GroupedConversation[] }>('get_dm_inbox_grouped');
    return result?.conversations || [];
  } catch (err) {
    console.error('Error fetching grouped DM inbox:', err);
    return [];
  }
};

/**
 * Get DM inbox for current user (READ — backend).
 * Returns a flat list derived from the grouped response (last message per partner).
 * Most callers should prefer `fetchDMInboxGrouped`. Kept for backward compatibility.
 */
export const fetchDMInbox = async (allMyIds: string[]): Promise<DirectMessage[]> => {
  const grouped = await fetchDMInboxGrouped(allMyIds);
  return grouped.map((c) => ({
    id: `${c.recipientId}-${c.lastTimestamp}`,
    sender_id: c.isSentByMe ? '' : c.recipientId,
    sender_name: c.recipientName,
    sender_type: 'staff',
    recipient_id: c.isSentByMe ? c.recipientId : '',
    recipient_name: c.recipientName,
    content: c.lastMessage,
    is_read: c.unreadCount === 0,
    created_at: c.lastTimestamp,
  }));
};
