import { supabase } from '@/integrations/supabase/client';
import { format, subHours } from 'date-fns';

export interface StaffMessage {
  id: string;
  staff_id: string;
  staff_name: string;
  content: string;
  message_type: string;
  booking_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface JobActivityItem {
  id: string;
  type: 'comment' | 'file' | 'time_report';
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
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching staff messages:', error);
    return [];
  }
  return (data as StaffMessage[]) || [];
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

  // Fetch recent comments
  const { data: comments } = await supabase
    .from('project_comments')
    .select('id, author_name, content, created_at, project_id, projects!inner(name)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  comments?.forEach((c: any) => {
    items.push({
      id: c.id,
      type: 'comment',
      author: c.author_name,
      content: c.content,
      project_name: c.projects?.name || '',
      created_at: c.created_at,
    });
  });

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

  // Sort all by date descending
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return items;
};
