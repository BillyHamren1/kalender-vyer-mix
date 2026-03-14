import { supabase } from '@/integrations/supabase/client';

export type BroadcastAudience = 'all_today' | 'job_staff' | 'active_staff' | 'selected_staff';
export type BroadcastCategory = 'info' | 'weather' | 'schedule' | 'logistics' | 'urgent';

export interface BroadcastMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  audience: BroadcastAudience;
  audience_booking_id: string | null;
  audience_staff_ids: string[] | null;
  category: BroadcastCategory;
  is_read_by: string[];
  created_at: string;
}

export const sendBroadcast = async (
  senderId: string,
  senderName: string,
  content: string,
  audience: BroadcastAudience,
  category: BroadcastCategory,
  audienceBookingId?: string,
  audienceStaffIds?: string[],
): Promise<void> => {
  const { error } = await supabase
    .from('broadcast_messages' as any)
    .insert({
      sender_id: senderId,
      sender_name: senderName,
      content: content.trim(),
      audience,
      category,
      audience_booking_id: audienceBookingId || null,
      audience_staff_ids: audienceStaffIds || null,
    });

  if (error) {
    console.error('Error sending broadcast:', error);
    throw error;
  }
};

export const fetchRecentBroadcasts = async (): Promise<BroadcastMessage[]> => {
  const { data, error } = await supabase
    .from('broadcast_messages' as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching broadcasts:', error);
    return [];
  }
  return (data as unknown as BroadcastMessage[]) || [];
};
