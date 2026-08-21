import { CalendarEvent, getEventColor, getTransportEventType } from '@/components/Calendar/ResourceData';
import type { CalendarTransportProjection } from '@/hooks/useTransportCalendarProjection';

export const transportProjectionToCalendarEvent = (transport: CalendarTransportProjection): CalendarEvent => {
  const start = transport.transportTime?.slice(0, 5) || '08:00';
  let end = transport.transportEndTime?.slice(0, 5) || '';
  if (!end) {
    const duration = transport.estimatedDuration || 60;
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + duration;
    end = `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  const typeLabel: Record<string, string> = {
    delivery: 'Leverans',
    pickup: 'Hämtning',
    transfer: 'Mellantransport',
    internal: 'Intern',
    other: 'Transport',
  };
  const transportEventType = getTransportEventType(transport.transportType);

  return {
    id: `transport-${transport.id}`,
    title: transport.bookingTitle,
    start: `${transport.transportDate}T${start}:00`,
    end: `${transport.transportDate}T${end}:00`,
    resourceId: 'logistics-transport',
    bookingId: transport.bookingId,
    bookingNumber: transport.bookingNumber || undefined,
    eventType: transportEventType,
    deliveryAddress: transport.destinationAddress || transport.deliveryAddress || undefined,
    viewed: true,
    editable: false,
    startEditable: false,
    durationEditable: false,
    backgroundColor: getEventColor(transportEventType),
    borderColor: transportEventType === 'transport_out' ? '#3B82F6' : '#F59E0B',
    extendedProps: {
      isTransportPlanning: true,
      transportAssignmentId: transport.id,
      planningStatus: transport.planningStatus,
      planningStatusLabel: transport.planningStatus === 'confirmed' ? 'Bekräftad' : 'Preliminär',
      transportType: transport.transportType,
      transportTypeLabel: typeLabel[transport.transportType] || 'Transport',
      originAddress: transport.originAddress,
      destinationAddress: transport.destinationAddress,
      vehicleName: transport.vehicleName,
      driverNotes: transport.driverNotes,
      bookingNumber: transport.bookingNumber || undefined,
      timeLabel: `${start}–${end}`,
    },
  };
};
