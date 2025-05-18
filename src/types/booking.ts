
export interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
}

export interface BookingAttachment {
  id: string;
  url: string;
  fileName: string;
  fileType: string;
}

export interface Booking {
  id: string;
  client: string;
  rigDayDate: string;
  eventDate: string;
  rigDownDate: string;
  deliveryAddress?: string;
  products?: BookingProduct[];
  internalNotes?: string;
  attachments?: BookingAttachment[];
  viewed: boolean; // Added 'viewed' property to track new bookings
}
