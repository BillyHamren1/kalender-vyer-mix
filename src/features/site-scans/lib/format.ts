/**
 * Shared formatting utilities used across pages.
 * Centralised to avoid duplicate fmt/timeAgo helpers.
 */

import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

/** Format a date string to "d MMM yyyy, HH:mm" in Swedish locale */
export function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "d MMM yyyy, HH:mm", { locale: sv });
}

/** Relative time string, e.g. "3 minuter sedan" */
export function timeAgo(date: string | null | undefined): string {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: sv });
}
