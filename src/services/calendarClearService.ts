import { toast } from "sonner";

/**
 * STEG 4P – DESTRUKTIV MASSRADERING BORTTAGEN (fail-closed).
 *
 * Denna modul innehöll tidigare globala DELETE-anrop mot calendar_events,
 * staff_assignments och booking_staff_assignments UTAN organization_id-filter,
 * dvs. de raderade rader tvärs över alla tenants.
 *
 * Funktionerna är nu no-ops som alltid misslyckas. De behålls endast så att
 * eventuella kvarvarande importer inte kraschar. Ingen data raderas.
 */

const BLOCKED_MESSAGE =
  "Massradering av kalender/personaltilldelningar är permanent avstängd (tenant-osäker destruktiv operation).";

export const clearAllCalendarEvents = async (): Promise<boolean> => {
  console.warn("[calendarClearService] clearAllCalendarEvents blocked:", BLOCKED_MESSAGE);
  toast.error(BLOCKED_MESSAGE);
  return false;
};

export const clearAllStaffAssignments = async (): Promise<boolean> => {
  console.warn("[calendarClearService] clearAllStaffAssignments blocked:", BLOCKED_MESSAGE);
  toast.error(BLOCKED_MESSAGE);
  return false;
};

export const clearAllBookingStaffAssignments = async (): Promise<boolean> => {
  console.warn("[calendarClearService] clearAllBookingStaffAssignments blocked:", BLOCKED_MESSAGE);
  toast.error(BLOCKED_MESSAGE);
  return false;
};

export const clearAndRefreshCalendar = async (
  _refreshCallback?: () => Promise<void>,
): Promise<void> => {
  console.warn("[calendarClearService] clearAndRefreshCalendar blocked:", BLOCKED_MESSAGE);
  toast.error(BLOCKED_MESSAGE);
};
