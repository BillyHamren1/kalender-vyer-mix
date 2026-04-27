import { supabase } from '@/integrations/supabase/client';
import { format, subHours } from 'date-fns';
import { mobileApi } from '@/services/mobileApiService';

export interface StaffMessage {
  id: string;
  staff_id: string;
  staff_name: string;
  content: string;
  message_type: string;
  booking_id: string | null;
  is_read: boolean;
  created_at: string;
  sender_type: string;
  sender_name: string | null;
}

export interface JobActivityItem {
  id: string;
  type: 'comment' | 'file' | 'time_report' | 'direct_message' | 'broadcast' | 'job_message';
  author: string;
  content: string;
  project_name?: string;
  created_at: string;
  url?: string;
}

export const fetchStaffMessages = async (): Promise<StaffMessage[]> => {
  const { data, error } = await supabase
    .from('staff_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('Error fetching staff messages:', error);
    return [];
  }
  return (data as StaffMessage[]) || [];
};

export const sendAdminMessage = async (content: string, adminName: string): Promise<void> => {
  const { error } = await supabase
    .from('staff_messages')
    .insert({
      staff_id: 'admin',
      staff_name: adminName,
      content: content.trim(),
      message_type: 'text',
      sender_type: 'admin',
      sender_name: adminName,
      is_read: true,
    });

  if (error) {
    console.error('Error sending admin message:', error);
    throw error;
  }
};

export const markMessageAsRead = async (messageId: string): Promise<void> => {
  const { error } = await supabase
    .from('staff_messages')
    .update({ is_read: true })
    .eq('id', messageId);

  if (error) console.error('Error marking message as read:', error);
};

export const markAllMessagesAsRead = async (): Promise<void> => {
  const { error } = await supabase
    .from('staff_messages')
    .update({ is_read: true })
    .eq('is_read', false);

  if (error) console.error('Error marking all messages as read:', error);
};

export const fetchJobActivity = async (): Promise<JobActivityItem[]> => {
  const since = subHours(new Date(), 24).toISOString();
  const today = format(new Date(), 'yyyy-MM-dd');
  const items: JobActivityItem[] = [];

  // Project comments removed — internalnotes is now the unified bulletin board.
  // (Notes don't generate per-row activity; activity feed shows files & status events instead.)

  // Fetch recent files (photos)
  const { data: files } = await supabase
    .from('project_files')
    .select('id, file_name, uploaded_by, uploaded_at, url, project_id, projects!inner(name)')
    .gte('uploaded_at', since)
    .order('uploaded_at', { ascending: false })
    .limit(20);

  files?.forEach((f: any) => {
    items.push({
      id: f.id,
      type: 'file',
      author: f.uploaded_by || 'Okänd',
      content: f.file_name,
      project_name: f.projects?.name || '',
      created_at: f.uploaded_at,
      url: f.url,
    });
  });

  // Fetch today's time reports
  const { data: reports } = await supabase
    .from('time_reports')
    .select('id, staff_id, booking_id, hours_worked, report_date, created_at, staff_members!inner(name), bookings!inner(client)')
    .eq('report_date', today)
    .eq('is_subdivision', false)
    .order('created_at', { ascending: false })
    .limit(20);

  reports?.forEach((r: any) => {
    items.push({
      id: r.id,
      type: 'time_report',
      author: r.staff_members?.name || 'Okänd',
      content: `${r.hours_worked}h rapporterat`,
      project_name: r.bookings?.client || '',
      created_at: r.created_at,
    });
  });

  // Messaging activity (DMs, broadcasts, job messages) is fetched via the
  // centralized mobile-app-api edge function. No direct queries to messaging
  // tables from the frontend — same auth/access path as the rest of chat.
  try {
    const msg = await mobileApi.getMessagingActivity({ since_hours: 24, limit_per_kind: 20 });

    msg.direct_messages?.forEach((d) => {
      items.push({
        id: `dm-${d.id}`,
        type: 'direct_message',
        author: d.sender_name,
        content: d.content || (d.file_name ? `📎 ${d.file_name}` : ''),
        project_name: `${d.sender_name} → ${d.recipient_name}`,
        created_at: d.created_at,
      });
    });

    const audienceLabels: Record<string, string> = {
      all_today: 'all personal idag',
      job_staff: 'jobbteam',
      active_staff: 'aktiv personal',
      selected_staff: 'utvald personal',
    };

    msg.broadcasts?.forEach((b) => {
      items.push({
        id: `bc-${b.id}`,
        type: 'broadcast',
        author: b.sender_name,
        content: b.content,
        project_name: `Broadcast → ${audienceLabels[b.audience] || b.audience}`,
        created_at: b.created_at,
      });
    });

    msg.job_messages?.forEach((jm) => {
      items.push({
        id: `jm-${jm.id}`,
        type: 'job_message',
        author: jm.sender_name,
        content: jm.content || (jm.file_name ? `📎 ${jm.file_name}` : ''),
        project_name: jm.bookings?.client || 'Jobbchatt',
        created_at: jm.created_at,
      });
    });
  } catch (err) {
    console.error('Error fetching messaging activity:', err);
  }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items;
};
