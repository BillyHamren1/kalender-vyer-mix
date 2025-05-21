
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

export interface BookingChange {
  id: string;
  changeType: 'new' | 'update' | 'status_change' | 'delete';
  changedAt: string;
  changedFields: string[];
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  version: number;
  changedBy?: string;
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
  status: string;
  version: number;
  changes?: BookingChange[];
}
