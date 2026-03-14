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
 * Fetch conversation between two participants (sorted by time).
 */
export const fetchDirectMessages = async (
  participantA: string,
  participantB: string,
): Promise<DirectMessage[]> => {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(
      `and(sender_id.eq.${participantA},recipient_id.eq.${participantB}),and(sender_id.eq.${participantB},recipient_id.eq.${participantA})`
    )
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching direct messages:', error);
    return [];
  }
  return (data as DirectMessage[]) || [];
};

/**
 * Send a direct message with optional file attachment and job tag.
 */
export const sendDirectMessage = async (
  senderId: string,
  senderName: string,
  senderType: 'planner' | 'staff',
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
  const insertData: Record<string, unknown> = {
    sender_id: senderId,
    sender_name: senderName,
    sender_type: senderType,
    recipient_id: recipientId,
    recipient_name: recipientName,
    content: content.trim(),
  };

  if (options?.fileUrl) {
    insertData.file_url = options.fileUrl;
    insertData.file_name = options.fileName || 'file';
    insertData.file_type = options.fileType || 'application/octet-stream';
  }
  if (options?.bookingId) {
    insertData.booking_id = options.bookingId;
  }

  const { error } = await supabase
    .from('direct_messages')
    .insert(insertData as any);

  if (error) {
    console.error('Error sending direct message:', error);
    throw error;
  }
};

/**
 * Upload a file for direct messages and return the public URL.
 */
export const uploadDMFile = async (
  file: File,
  senderId: string,
): Promise<{ url: string; fileName: string; fileType: string }> => {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `dm-files/${senderId}/${Date.now()}_${file.name}`;

  const { error } = await supabase.storage
    .from('project-files')
    .upload(path, file, { upsert: false });

  if (error) {
    console.error('Error uploading DM file:', error);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('project-files')
    .getPublicUrl(path);

  return {
    url: urlData.publicUrl,
    fileName: file.name,
    fileType: file.type || `application/${ext}`,
  };
};

/**
 * Mark all messages from a specific sender as read.
 */
export const markDirectMessagesRead = async (
  recipientId: string,
  senderId: string,
): Promise<void> => {
  const { error } = await supabase
    .from('direct_messages')
    .update({ is_read: true })
    .eq('recipient_id', recipientId)
    .eq('sender_id', senderId)
    .eq('is_read', false);

  if (error) console.error('Error marking DMs as read:', error);
};

/**
 * Get unread DM count for a recipient.
 */
export const fetchUnreadDMCount = async (recipientId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('is_read', false);

  if (error) return 0;
  return count || 0;
};

/**
 * Get DM inbox for a staff member.
 */
export const fetchDMInbox = async (staffId: string): Promise<DirectMessage[]> => {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${staffId},recipient_id.eq.${staffId}`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching DM inbox:', error);
    return [];
  }
  return (data as DirectMessage[]) || [];
};
