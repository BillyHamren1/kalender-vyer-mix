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
}

/**
 * Fetch conversation between two participants (sorted by time).
 * Uses LEAST/GREATEST index pattern for bidirectional lookup.
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
 * Send a direct message from planner to staff (or vice versa).
 */
export const sendDirectMessage = async (
  senderId: string,
  senderName: string,
  senderType: 'planner' | 'staff',
  recipientId: string,
  recipientName: string,
  content: string,
): Promise<void> => {
  const { error } = await supabase
    .from('direct_messages')
    .insert({
      sender_id: senderId,
      sender_name: senderName,
      sender_type: senderType,
      recipient_id: recipientId,
      recipient_name: recipientName,
      content: content.trim(),
    });

  if (error) {
    console.error('Error sending direct message:', error);
    throw error;
  }
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
 * Get DM inbox for a staff member (grouped by conversation partner, latest message).
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
