/**
 * ============================================================
 * EVENT EDIT HELPERS — Shared Logic for Event Editing
 * ============================================================
 * 
 * Extracted from QuickTimeEditPopover, EditEventTimeDialog, and
 * MoveEventDateDialog. These pure functions consolidate the
 * duplicated time/date update logic into a single location.
 * 
 * IMPORTANT: The original dialogs continue to work unchanged.
 * This module provides shared helpers that can be gradually
 * adopted. No dialog UI or behavior is modified.
 * ============================================================
 */

import { parse, isAfter } from 'date-fns';
import { updateCalendarEvent } from '@/services/calendarService';
import { supabase } from '@/integrations/supabase/client';
import { extractUTCTime, extractUTCDate, buildUTCDateTime } from '@/utils/dateUtils';

// ─── Types ─────────────────────────────────────────────────

/** Minimal event shape required by edit helpers */
export interface EditableEvent {
  id: string;
  title: string;
  start: string | Date;
  end: string | Date;
  bookingId?: string;
  eventType?: string;
}

export interface TimeUpdateParams {
  event: EditableEvent;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface DateMoveParams {
  event: EditableEvent;
  newDateStr: string; // yyyy-MM-dd
}

export interface TimeValidationResult {
  valid: boolean;
  error?: string;
}

// ─── Validation ────────────────────────────────────────────

/**
 * Validates that end time is after start time.
 * Extracted from QuickTimeEditPopover and EditEventTimeDialog
 * which both had identical validation logic.
 */
export function validateTimeRange(startTime: string, endTime: string, referenceDate: Date): TimeValidationResult {
  const startDate = parse(startTime, 'HH:mm', referenceDate);
  const endDate = parse(endTime, 'HH:mm', referenceDate);

  if (!isAfter(endDate, startDate)) {
    return { valid: false, error: 'End time must be after start time' };
  }

  return { valid: true };
}

/**
 * Validates that a date string is a valid date.
 */
export function validateDate(dateStr: string): TimeValidationResult {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date' };
  }
  return { valid: true };
}

// ─── Booking Field Mapping ─────────────────────────────────

/**
 * Maps eventType to the corresponding booking table fields.
 * Extracted from QuickTimeEditPopover and MoveEventDateDialog
 * which both had identical mapping objects.
 */
export const BOOKING_TIME_FIELDS: Record<string, { start: string; end: string }> = {
  rig: { start: 'rig_start_time', end: 'rig_end_time' },
  event: { start: 'event_start_time', end: 'event_end_time' },
  rigDown: { start: 'rigdown_start_time', end: 'rigdown_end_time' },
};

export const BOOKING_DATE_FIELDS: Record<string, string> = {
  rig: 'rigdaydate',
  event: 'eventdate',
  rigDown: 'rigdowndate',
};

/**
 * Returns the booking fields for a given event type, or null if unknown.
 */
export function getBookingFields(eventType: string | undefined) {
  if (!eventType) return null;
  const timeFields = BOOKING_TIME_FIELDS[eventType];
  const dateField = BOOKING_DATE_FIELDS[eventType];
  if (!timeFields) return null;
  return { ...timeFields, date: dateField || null };
}

// ─── Update Operations ─────────────────────────────────────

/**
 * Updates an event's time (start + end) on both calendar_events
 * and bookings tables. Consolidates the duplicate logic from
 * QuickTimeEditPopover.handleSave and EditEventTimeDialog.handleSave.
 * 
 * Returns { success: boolean; error?: string }
 */
export async function updateEventTime({ event, startTime, endTime }: TimeUpdateParams): Promise<{ success: boolean; error?: string }> {
  // Validate
  const eventStart = typeof event.start === 'string' ? new Date(event.start) : event.start;
  const validation = validateTimeRange(startTime, endTime, eventStart);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Extract date part (YYYY-MM-DD) from original event
    const datePart = typeof event.start === 'string'
      ? event.start.split('T')[0]
      : event.start.toISOString().split('T')[0];

    // Build new UTC ISO strings
    const newStartISO = `${datePart}T${startTime}:00Z`;
    const newEndISO = `${datePart}T${endTime}:00Z`;

    // 1. Update calendar_events
    await updateCalendarEvent(event.id, {
      start: new Date(newStartISO).toISOString(),
      end: new Date(newEndISO).toISOString(),
    });

    // 2. Update bookings table (if applicable)
    await syncBookingTimes(event.bookingId, event.eventType, newStartISO, newEndISO);

    return { success: true };
  } catch (error) {
    console.error('[EventEditHelpers] Error updating event time:', error);
    return { success: false, error: 'Failed to update event time' };
  }
}

/**
 * Moves an event to a new date while preserving its time.
 * Consolidates the logic from MoveEventDateDialog.handleMove.
 * 
 * Returns { success: boolean; error?: string }
 */
export async function moveEventToDate({ event, newDateStr }: DateMoveParams): Promise<{ success: boolean; error?: string }> {
  const dateValidation = validateDate(`${newDateStr}T00:00:00Z`);
  if (!dateValidation.valid) {
    return { success: false, error: dateValidation.error };
  }

  try {
    // Preserve original times
    const startTimeStr = extractUTCTime(event.start);
    const endTimeStr = extractUTCTime(event.end);

    // Build new ISO strings with new date + old times
    const newStartISO = buildUTCDateTime(newDateStr, startTimeStr);
    const newEndISO = buildUTCDateTime(newDateStr, endTimeStr);

    // 1. Update calendar_events
    await updateCalendarEvent(event.id, {
      start: newStartISO,
      end: newEndISO,
    });

    // 2. Update bookings table (date + times)
    if (event.bookingId && event.eventType) {
      const fields = getBookingFields(event.eventType);
      if (fields && fields.date) {
        await supabase
          .from('bookings')
          .update({
            [fields.date]: newDateStr,
            [fields.start]: newStartISO,
            [fields.end]: newEndISO,
          })
          .eq('id', event.bookingId);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[EventEditHelpers] Error moving event:', error);
    return { success: false, error: 'Failed to move event' };
  }
}

// ─── Internal Helpers ──────────────────────────────────────

/**
 * Syncs time updates to the bookings table.
 * Shared between updateEventTime and other operations.
 */
async function syncBookingTimes(
  bookingId: string | undefined,
  eventType: string | undefined,
  newStartISO: string,
  newEndISO: string
): Promise<void> {
  if (!bookingId || !eventType) return;

  const fields = getBookingFields(eventType);
  if (!fields) return;

  await supabase
    .from('bookings')
    .update({
      [fields.start]: newStartISO,
      [fields.end]: newEndISO,
    })
    .eq('id', bookingId);
}
