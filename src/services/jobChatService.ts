import { supabase } from '@/integrations/supabase/client';

export interface JobMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  is_archived: boolean;
  created_at: string;
}

export interface JobChatParticipant {
  id: string;
  name: string;
  role: 'planner' | 'team_leader' | 'staff';
}

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

export const sendJobMessage = async (
  bookingId: string,
  senderId: string,
  senderName: string,
  senderRole: string,
  content: string,
): Promise<void> => {
  const { error } = await supabase
    .from('job_messages')
    .insert({
      booking_id: bookingId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      content: content.trim(),
    });

  if (error) {
    console.error('Error sending job message:', error);
    throw error;
  }
};

export const archiveJobConversation = async (bookingId: string): Promise<void> => {
  const { error } = await supabase
    .from('job_messages')
    .update({ is_archived: true })
    .eq('booking_id', bookingId);

  if (error) console.error('Error archiving job conversation:', error);
};

export const fetchJobParticipants = async (bookingId: string, date: string): Promise<JobChatParticipant[]> => {
  const participants: JobChatParticipant[] = [];

  // Get assigned staff for this booking
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

  // Get planners (users with planning access via profiles)
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
