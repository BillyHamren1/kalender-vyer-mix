
export interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
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
  attachments?: string[]; // URLs to attachments
}
