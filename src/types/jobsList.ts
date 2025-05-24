
export interface JobsListItem {
  bookingId: string;
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
}

export interface JobsListFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  team?: string;
  search?: string;
}
