import { addDays, subDays, differenceInMonths, isBefore, startOfDay } from 'date-fns';
import { DeadlineRule } from './defaultChecklist';

export interface BookingDates {
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  created_at: string;
}

export interface CalculatedDeadline {
  date: Date;
  isAsap: boolean;
}

export function calculateDeadline(
  rule: DeadlineRule,
  booking: BookingDates
): CalculatedDeadline {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  
  // Parse dates, using fallbacks if not available
  const rig = booking.rigdaydate ? new Date(booking.rigdaydate) : null;
  const event = booking.eventdate ? new Date(booking.eventdate) : null;
  const rigdown = booking.rigdowndate ? new Date(booking.rigdowndate) : null;
  const created = new Date(booking.created_at);
  
  let deadline: Date;
  let isAsap = false;
  
  switch (rule.type) {
    case 'before_rig':
      if (rig) {
        deadline = subDays(rig, rule.days);
      } else if (event) {
        deadline = subDays(event, rule.days);
      } else {
        deadline = tomorrow;
        isAsap = true;
      }
      break;
      
    case 'before_event':
      if (event) {
        deadline = subDays(event, rule.days);
      } else if (rig) {
        deadline = subDays(rig, rule.days);
      } else {
        deadline = tomorrow;
        isAsap = true;
      }
      break;
      
    case 'after_rigdown':
      if (rigdown) {
        deadline = addDays(rigdown, rule.days);
      } else if (event) {
        deadline = addDays(event, rule.days);
      } else {
        deadline = addDays(tomorrow, rule.days);
      }
      break;
      
    case 'after_created':
      // Special case for UE booking - check if we have enough time
      const referenceDate = rig || event;
      if (referenceDate && rule.minMonthsRequired) {
        const monthsUntilRef = differenceInMonths(referenceDate, today);
        if (monthsUntilRef >= rule.minMonthsRequired) {
          deadline = addDays(created, rule.days);
          // If the calculated deadline is in the past, use ASAP
          if (isBefore(deadline, today)) {
            deadline = tomorrow;
            isAsap = true;
          }
        } else {
          deadline = tomorrow;
          isAsap = true;
        }
      } else {
        deadline = addDays(created, rule.days);
      }
      break;
      
    case 'on_rig':
      deadline = rig || event || tomorrow;
      break;
      
    case 'on_event':
      deadline = event || rig || tomorrow;
      break;
      
    case 'on_rigdown':
      deadline = rigdown || event || tomorrow;
      break;
      
    default:
      deadline = tomorrow;
  }
  
  // ASAP logic: if deadline has already passed
  if (rule.asapIfLess && isBefore(deadline, today)) {
    deadline = tomorrow;
    isAsap = true;
  }
  
  return { date: deadline, isAsap };
}
