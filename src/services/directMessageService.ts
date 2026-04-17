import { supabase } from '@/integrations/supabase/client';

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

/**
 * Fetch conversation between two participants (sorted by time).
 * READ — direct DB query (RLS protected).
 */
export const fetchDirectMessages = async (
  allMyIds: string[],
  allPartnerIds: string[],
): Promise<DirectMessage[]> => {
  if (allMyIds.length === 0 || allPartnerIds.length === 0) return [];

  const conditions: string[] = [];
  for (const myId of allMyIds) {
    for (const partnerId of allPartnerIds) {
      conditions.push(`and(sender_id.eq.${myId},recipient_id.eq.${partnerId})`);
      conditions.push(`and(sender_id.eq.${partnerId},recipient_id.eq.${myId})`);
    }
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(conditions.join(','))
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching direct messages:', error);
    return [];
  }
  return (data as DirectMessage[]) || [];
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
 * Get unread DM count for a recipient (READ).
 */
export const fetchUnreadDMCount = async (allMyIds: string[]): Promise<number> => {
  if (allMyIds.length === 0) return 0;

  const orFilter = allMyIds.map(id => `recipient_id.eq.${id}`).join(',');
  const { count, error } = await supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .or(orFilter)
    .eq('is_read', false);

  if (error) return 0;
  return count || 0;
};

/**
 * Get DM inbox for a staff member (READ).
 */
export const fetchDMInbox = async (allMyIds: string[]): Promise<DirectMessage[]> => {
  if (allMyIds.length === 0) return [];

  const orFilter = allMyIds.map(id => `sender_id.eq.${id},recipient_id.eq.${id}`).join(',');
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching DM inbox:', error);
    return [];
  }
  return (data as DirectMessage[]) || [];
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
 * Get DM inbox grouped by conversation partner (READ).
 */
export const fetchDMInboxGrouped = async (allMyIds: string[]): Promise<GroupedConversation[]> => {
  if (allMyIds.length === 0) return [];

  const myIdSet = new Set(allMyIds);
  const orFilter = allMyIds.map(id => `sender_id.eq.${id},recipient_id.eq.${id}`).join(',');

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Error fetching grouped DM inbox:', error);
    return [];
  }

  const msgs = (data as DirectMessage[]) || [];
  const convMap = new Map<string, GroupedConversation>();

  for (const m of msgs) {
    const isMe = myIdSet.has(m.sender_id);
    const partnerId = isMe ? m.recipient_id : m.sender_id;
    const partnerName = isMe ? m.recipient_name : m.sender_name;

    if (myIdSet.has(partnerId)) continue;

    if (!convMap.has(partnerId)) {
      convMap.set(partnerId, {
        recipientId: partnerId,
        recipientName: partnerName,
        lastMessage: m.content,
        lastTimestamp: m.created_at,
        unreadCount: 0,
        isSentByMe: isMe,
      });
    }

    if (!isMe && !m.is_read) {
      const conv = convMap.get(partnerId)!;
      conv.unreadCount++;
    }
  }

  return Array.from(convMap.values()).sort(
    (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
  );
};
