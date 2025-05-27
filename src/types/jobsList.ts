
export interface JobsListItem {
  bookingId: string;
  bookingNumber?: string;
  client: string;
  status: string;
  rigDate?: string;
  rigTime?: string;
  rigTeams?: string[]; // Changed from rigTeam to rigTeams (array)
  rigStaff?: string[];
  eventDate?: string;
  eventTime?: string;
  eventTeams?: string[]; // Changed from eventTeam to eventTeams (array)
  eventStaff?: string[];
  rigDownDate?: string;
  rigDownTime?: string;
  rigDownTeams?: string[]; // Changed from rigDownTeam to rigDownTeams (array)
  rigDownStaff?: string[];
  deliveryAddress?: string;
  deliveryCity?: string;
  viewed: boolean;
  hasCalendarEvents?: boolean;
  totalCalendarEvents?: number;
}

export interface JobsListFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  team?: string;
  search?: string;
  hasCalendarEvents?: boolean;
  deliveryCity?: string;
}
