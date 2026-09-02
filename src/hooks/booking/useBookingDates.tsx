import { useState } from 'react';
import { toast } from 'sonner';
import { Booking } from '@/types/booking';
import { updateBookingDatesViaApi } from '@/services/planningApiService';
import {
  buildAddDatePayload,
  buildRemoveDatePayload,
  buildEditDatePayload,
  type DatePhase,
} from '@/lib/booking/bookingDateMutations';

/**
 * Alla datum-/tidsändringar går via Bookings centrala skrivväg.
 * Hooken skriver ALDRIG till Plannings databas eller kalenderposter,
 * och in-memory state uppdateras först efter lyckat centralt svar.
 */
export const useBookingDates = (
  id: string | undefined,
  booking: Booking | null,
  rigDates: string[],
  eventDates: string[],
  rigDownDates: string[],
  setBooking: (booking: Booking) => void,
  setRigDates: (dates: string[]) => void,
  setEventDates: (dates: string[]) => void,
  setRigDownDates: (dates: string[]) => void
) => {
  const [isSaving, setIsSaving] = useState(false);

  // Helper function to format date as YYYY-MM-DD without timezone conversion
  const formatDateToLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const existingFor = (phase: DatePhase) =>
    phase === 'rig' ? rigDates : phase === 'event' ? eventDates : rigDownDates;

  const applyDates = (phase: DatePhase, dates: string[]) => {
    if (phase === 'rig') setRigDates(dates);
    else if (phase === 'event') setEventDates(dates);
    else setRigDownDates(dates);
  };

  const legacyFieldFor = (phase: DatePhase) =>
    phase === 'rig' ? 'rigDayDate' : phase === 'event' ? 'eventDate' : 'rigDownDate';

  const phaseLabel = (phase: DatePhase) =>
    phase === 'rig' ? 'riggdag' : phase === 'event' ? 'eventdag' : 'nedrivningsdag';

  // Add a date — skickar alltid HELA den uppdaterade arrayen till Booking
  const addDate = async (date: Date, dateType: DatePhase, _autoSync?: boolean) => {
    if (!booking || !id || !date) return;

    const formattedDate = formatDateToLocalString(date);
    const existing = existingFor(dateType);
    if (existing.includes(formattedDate)) return;

    try {
      setIsSaving(true);
      const { dates, payload } = buildAddDatePayload(dateType, existing, formattedDate);
      await updateBookingDatesViaApi(id, payload);

      // Först efter lyckad central skrivning uppdateras UI-state.
      applyDates(dateType, dates);
      setBooking({ ...booking, [legacyFieldFor(dateType)]: dates[0] ?? '' });
    } catch (err) {
      console.error(`Error adding ${dateType} date:`, err);
      toast.error(`Kunde inte lägga till ${phaseLabel(dateType)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Remove a date — skickar hela den kvarvarande listan
  const removeDate = async (date: string, dateType: DatePhase, _autoSync?: boolean) => {
    if (!booking || !id) return;

    try {
      setIsSaving(true);
      const { dates, payload } = buildRemoveDatePayload(dateType, existingFor(dateType), date);
      await updateBookingDatesViaApi(id, payload);

      applyDates(dateType, dates);
      setBooking({ ...booking, [legacyFieldFor(dateType)]: dates[0] ?? '' });
    } catch (err) {
      console.error(`Error removing ${dateType} date:`, err);
      toast.error(`Kunde inte ta bort ${phaseLabel(dateType)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Backward compatible single-date setter — bevarar övriga datum
  const handleDateChange = async (
    date: Date | undefined,
    dateType: 'rigDayDate' | 'eventDate' | 'rigDownDate',
    _autoSync?: boolean
  ) => {
    if (!booking || !id || !date) return;

    const phase: DatePhase =
      dateType === 'rigDayDate' ? 'rig' : dateType === 'eventDate' ? 'event' : 'rigDown';
    const formattedDate = formatDateToLocalString(date);
    const existing = existingFor(phase);
    const currentPrimary = (booking as unknown as Record<string, unknown>)[dateType] as string | undefined;

    try {
      setIsSaving(true);
      // Byt ut nuvarande primärdatum men behåll alla övriga datum.
      const { dates, payload } = currentPrimary && existing.includes(currentPrimary)
        ? buildEditDatePayload(phase, existing, currentPrimary, formattedDate)
        : buildAddDatePayload(phase, existing, formattedDate);

      await updateBookingDatesViaApi(id, payload);

      applyDates(phase, dates);
      setBooking({ ...booking, [dateType]: formattedDate });
    } catch (err) {
      console.error(`Error updating ${dateType}:`, err);
      toast.error(`Kunde inte uppdatera ${phaseLabel(phase)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Edit a date (change date and/or times) — HH:mm skickas till mappningen
  const editDate = async (
    oldDate: string,
    newDate: string,
    startTime: string,
    endTime: string,
    dateType: DatePhase
  ) => {
    if (!booking || !id) return;

    let dates: string[];
    let payload: Record<string, unknown>;
    try {
      // Fail-closed innan någon skrivning eller state-ändring.
      ({ dates, payload } = buildEditDatePayload(
        dateType,
        existingFor(dateType),
        oldDate,
        newDate,
        startTime,
        endTime,
      ));
    } catch (err) {
      console.error(`Blocked ${dateType} date edit:`, err);
      toast.error(err instanceof Error ? err.message : 'Kunde inte uppdatera datumet');
      return;
    }

    try {
      setIsSaving(true);
      await updateBookingDatesViaApi(id, payload);

      applyDates(dateType, dates);

      const localFieldMap = {
        rig: { date: 'rigDayDate', start: 'rigStartTime', end: 'rigEndTime' },
        event: { date: 'eventDate', start: 'eventStartTime', end: 'eventEndTime' },
        rigDown: { date: 'rigDownDate', start: 'rigDownStartTime', end: 'rigDownEndTime' },
      } as const;
      const localFields = localFieldMap[dateType];
      const next: Booking = { ...booking, [localFields.date]: newDate };
      if (dateType !== 'event') {
        (next as unknown as Record<string, unknown>)[localFields.start] = (payload[
          dateType === 'rig' ? 'rig_start_time' : 'rigdown_start_time'
        ] as string) ?? null;
        (next as unknown as Record<string, unknown>)[localFields.end] = (payload[
          dateType === 'rig' ? 'rig_end_time' : 'rigdown_end_time'
        ] as string) ?? null;
      }
      setBooking(next);
    } catch (err) {
      console.error(`Error editing ${dateType} date:`, err);
      toast.error('Kunde inte uppdatera datumet');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isSaving,
    isSyncingToCalendar: false,
    handleDateChange,
    syncWithCalendar: async () => { /* no-op: Booking äger datum/tider */ },
    addDate,
    removeDate,
    editDate
  };
};
