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
  deliveryCity?: string;
  deliveryPostalCode?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  carryMoreThan10m?: boolean;
  groundNailsAllowed?: boolean;
  exactTimeNeeded?: boolean;
  exactTimeInfo?: string;
  products?: BookingProduct[];
  internalNotes?: string;
  attachments?: BookingAttachment[];
  viewed: boolean;
}
