export interface Job {
  id: string;
  bookingId: string | null;
  name: string;
  status: 'planned' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
  // Joined data from booking
  booking?: {
    client: string;
    bookingNumber: string | null;
    deliveryAddress: string | null;
    rigDayDate: string | null;
    eventDate: string | null;
    rigDownDate: string | null;
  };
  // Staff assignments
  staffAssignments?: JobStaffAssignment[];
}

export interface JobStaffAssignment {
  id: string;
  jobId: string;
  staffId: string;
  assignmentDate: string;
  staffName?: string;
  staffColor?: string;
}

export type JobStatus = 'planned' | 'in_progress' | 'completed';
