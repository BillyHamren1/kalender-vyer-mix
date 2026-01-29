import { supabase } from '@/integrations/supabase/client';
import { Job, JobStaffAssignment } from '@/types/job';

// Transform database job to frontend Job type
const transformJob = (dbJob: any): Job => ({
  id: dbJob.id,
  bookingId: dbJob.booking_id,
  name: dbJob.name,
  status: dbJob.status,
  createdAt: dbJob.created_at,
  updatedAt: dbJob.updated_at,
  booking: dbJob.bookings ? {
    client: dbJob.bookings.client,
    bookingNumber: dbJob.bookings.booking_number,
    deliveryAddress: dbJob.bookings.deliveryaddress,
    rigDayDate: dbJob.bookings.rigdaydate,
    eventDate: dbJob.bookings.eventdate,
    rigDownDate: dbJob.bookings.rigdowndate,
  } : undefined,
});

// Fetch all jobs with booking info
export const fetchJobs = async (): Promise<Job[]> => {
  const { data, error } = await supabase
    .from('jobs')
    .select(`
      *,
      bookings (
        client,
        booking_number,
        deliveryaddress,
        rigdaydate,
        eventdate,
        rigdowndate
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }

  return (data || []).map(transformJob);
};

// Fetch single job with staff assignments
export const fetchJobById = async (jobId: string): Promise<Job | null> => {
  const { data, error } = await supabase
    .from('jobs')
    .select(`
      *,
      bookings (
        client,
        booking_number,
        deliveryaddress,
        rigdaydate,
        eventdate,
        rigdowndate
      )
    `)
    .eq('id', jobId)
    .single();

  if (error) {
    console.error('Error fetching job:', error);
    return null;
  }

  const job = transformJob(data);

  // Fetch staff assignments
  const { data: assignments } = await supabase
    .from('job_staff_assignments')
    .select(`
      *,
      staff_members (name, color)
    `)
    .eq('job_id', jobId);

  job.staffAssignments = (assignments || []).map((a: any) => ({
    id: a.id,
    jobId: a.job_id,
    staffId: a.staff_id,
    assignmentDate: a.assignment_date,
    staffName: a.staff_members?.name,
    staffColor: a.staff_members?.color,
  }));

  return job;
};

// Create job from booking
export const createJobFromBooking = async (bookingId: string): Promise<Job> => {
  // Get booking info
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('client, booking_number')
    .eq('id', bookingId)
    .single();

  if (bookingError) throw bookingError;

  const jobName = booking.booking_number 
    ? `${booking.client} #${booking.booking_number}`
    : booking.client;

  // Create job
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      booking_id: bookingId,
      name: jobName,
      status: 'planned'
    })
    .select()
    .single();

  if (error) throw error;

  // Mark booking as assigned
  await supabase
    .from('bookings')
    .update({
      assigned_to_project: true,
      assigned_project_id: data.id,
      assigned_project_name: `Jobb: ${jobName}`
    })
    .eq('id', bookingId);

  return transformJob(data);
};

// Update job status
export const updateJobStatus = async (jobId: string, status: string): Promise<void> => {
  const { error } = await supabase
    .from('jobs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw error;
};

// Add staff to job
export const addStaffToJob = async (
  jobId: string, 
  staffId: string, 
  assignmentDate: string
): Promise<JobStaffAssignment> => {
  const { data, error } = await supabase
    .from('job_staff_assignments')
    .insert({
      job_id: jobId,
      staff_id: staffId,
      assignment_date: assignmentDate
    })
    .select(`
      *,
      staff_members (name, color)
    `)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    jobId: data.job_id,
    staffId: data.staff_id,
    assignmentDate: data.assignment_date,
    staffName: data.staff_members?.name,
    staffColor: data.staff_members?.color,
  };
};

// Remove staff from job
export const removeStaffFromJob = async (assignmentId: string): Promise<void> => {
  const { error } = await supabase
    .from('job_staff_assignments')
    .delete()
    .eq('id', assignmentId);

  if (error) throw error;
};

// Delete job
export const deleteJob = async (jobId: string): Promise<void> => {
  // Get booking_id first to un-assign it
  const { data: job } = await supabase
    .from('jobs')
    .select('booking_id')
    .eq('id', jobId)
    .single();

  if (job?.booking_id) {
    await supabase
      .from('bookings')
      .update({
        assigned_to_project: false,
        assigned_project_id: null,
        assigned_project_name: null
      })
      .eq('id', job.booking_id);
  }

  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', jobId);

  if (error) throw error;
};
