import React from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OperationsTargetRef } from '@/features/time-v2/lib/operations';

interface Props {
  targets: readonly OperationsTargetRef[];
}

/**
 * Opens the exact Booking/Planning source objects stated by Time's contract.
 * Missing ids stay visible as text elsewhere; this component never guesses a
 * route from a title or booking number.
 */
const OperationsTargetLinks: React.FC<Props> = ({ targets }) => {
  const bookings = targets.filter(
    (target, index, all) =>
      !!target.bookingId && all.findIndex((candidate) => candidate.bookingId === target.bookingId) === index,
  );
  const projects = targets.filter(
    (target, index, all) =>
      !!target.projectId && all.findIndex((candidate) => candidate.projectId === target.projectId) === index,
  );

  if (bookings.length === 0 && projects.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Öppna Planning-underlag" data-testid="time-v2-ops-target-links">
      {bookings.map((target) => (
        <Button key={`booking:${target.bookingId}`} variant="outline" size="sm" asChild>
          <Link
            to={`/booking/${target.bookingId}`}
            data-testid="time-v2-ops-open-booking"
            data-booking-id={target.bookingId ?? undefined}
          >
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Öppna bokning {target.bookingNumber ?? target.bookingTitle ?? ''}
          </Link>
        </Button>
      ))}
      {projects.map((target) => (
        <Button key={`project:${target.projectId}`} variant="outline" size="sm" asChild>
          <Link
            to={`/project-next/${target.projectId}`}
            data-testid="time-v2-ops-open-project"
            data-project-id={target.projectId ?? undefined}
          >
            <BriefcaseBusiness className="mr-1.5 h-4 w-4" />
            Öppna projekt {target.projectName ?? ''}
          </Link>
        </Button>
      ))}
    </nav>
  );
};

export default OperationsTargetLinks;
