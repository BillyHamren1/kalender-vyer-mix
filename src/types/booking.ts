
export interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  unitPrice?: number;
  totalPrice?: number;
  parentProductId?: string;
}

export interface BookingAttachment {
  id: string;
  url: string;
  fileName: string;
  fileType: string;
}

export interface Booking {
  id: string;
  bookingNumber?: string;
  client: string;
  rigDayDate: string;
  eventDate: string;
  rigDownDate: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostalCode?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  carryMoreThan10m?: boolean;
  groundNailsAllowed?: boolean;
  exactTimeNeeded?: boolean;
  exactTimeInfo?: string;
  products?: BookingProduct[];
  internalNotes?: string;
  attachments?: BookingAttachment[];
  viewed: boolean;
  status: string;
  assignedProjectId?: string;
  assignedProjectName?: string;
  assignedToProject?: boolean;
}
