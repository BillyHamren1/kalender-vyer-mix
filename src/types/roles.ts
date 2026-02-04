// App role types for the EventFlow ecosystem
export type AppRole = 'admin' | 'forsaljning' | 'projekt' | 'lager';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

// Access control helpers
export const PLANNING_ROLES: AppRole[] = ['admin', 'projekt', 'lager'];
export const WAREHOUSE_ROLES: AppRole[] = ['admin', 'lager'];
export const BOOKING_ROLES: AppRole[] = ['admin', 'forsaljning'];

export const canAccessPlanning = (roles: AppRole[]): boolean => {
  return roles.some(role => PLANNING_ROLES.includes(role));
};

export const canAccessWarehouse = (roles: AppRole[]): boolean => {
  return roles.some(role => WAREHOUSE_ROLES.includes(role));
};

export const canAccessBooking = (roles: AppRole[]): boolean => {
  return roles.some(role => BOOKING_ROLES.includes(role));
};
