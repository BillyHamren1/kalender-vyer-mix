
export interface JobsListItem {
  bookingId: string;
  bookingNumber?: string; // Add booking number field for display
  client: string;
  status: string;
  rigDate?: string;
  rigTime?: string;
  rigTeam?: string;
  rigStaff?: string[];
  eventDate?: string;
  eventTime?: string;
  eventTeam?: string;
  eventStaff?: string[];
  rigDownDate?: string;
  rigDownTime?: string;
  rigDownTeam?: string;
  rigDownStaff?: string[];
  deliveryAddress?: string;
  deliveryCity?: string;
  viewed: boolean;
  // New fields for enhanced functionality
  hasCalendarEvents?: boolean;
  totalCalendarEvents?: number;
}

export interface JobsListFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  team?: string;
  search?: string;
  // New filter options
  hasCalendarEvents?: boolean;
  deliveryCity?: string;
}
