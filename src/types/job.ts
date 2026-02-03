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
  // Full booking data for job detail page
  fullBooking?: {
    id: string;
    client: string;
    booking_number: string | null;
    deliveryaddress: string | null;
    delivery_city: string | null;
    delivery_postal_code: string | null;
    delivery_latitude: number | null;
    delivery_longitude: number | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    rigdaydate: string | null;
    eventdate: string | null;
    rigdowndate: string | null;
    rig_start_time: string | null;
    rig_end_time: string | null;
    event_start_time: string | null;
    event_end_time: string | null;
    rigdown_start_time: string | null;
    rigdown_end_time: string | null;
    internalnotes: string | null;
    carry_more_than_10m: boolean | null;
    ground_nails_allowed: boolean | null;
    exact_time_needed: boolean | null;
    exact_time_info: string | null;
    products: JobBookingProduct[];
    attachments: JobBookingAttachment[];
  };
  // Staff assignments
  staffAssignments?: JobStaffAssignment[];
}

export interface JobBookingProduct {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  notes: string | null;
}

export interface JobBookingAttachment {
  id: string;
  fileName: string | null;
  fileType: string | null;
  url: string;
  uploadedAt: string;
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
