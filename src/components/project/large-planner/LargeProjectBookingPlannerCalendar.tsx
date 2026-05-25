/**
 * LargeProjectBookingPlannerCalendar — ISOLERAD intern bokningsplanerare
 * --------------------------------------------------------------------------
 * Mål: planera BOKNINGAR/TASKS inuti ett stort projekt utan att röra
 * personalkalenderns dataskrivning.
 *
 * HÅRDA REGLER (locked by .lovable/large-project-calendar-audit.md):
 *  - Får ALDRIG skriva till:
 *      • calendar_events
 *      • staff_assignments
 *      • booking_staff_assignments
 *      • large_project_team_assignments
 *  - Får ALDRIG importera/anropa:
 *      • useUnifiedStaffOperations (skrivvägar)
 *      • staffAssignmentCore.{assignStaffToTeamCore,removeStaffAssignmentCore}
 *      • services/calendarService.{updateCalendarEvent,addCalendarEvent,deleteCalendarEvent}
 *      • services/eventService write-funktioner
 *      • services/largeProjectPlannerService.{moveLargeProjectDay,setLargeProjectDayTeam}
 *      • services/warehouseAssignmentsSync.*
 *      • useEventDragDrop (default-handler — den uppdaterar calendar_events)
 *
 *  - FÅR läsa staff_assignments / calendar_events för att visa vilka som
 *    redan är planerade i personalkalendern (read-only display).
 *
 * UI/UX: återanvänd presentational delar från CustomCalendar (dagkort,
 * tidsgrid, badges) men ALDRIG dess write-handlers.
 *
 * Status: STUB. Switch-punkten i LargeEstablishmentPage (rad ~209) ska bytas
 * från <ProjectCalendarView /> till denna komponent när den är färdig.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays } from 'lucide-react';

interface Props {
  projectId: string;
}

const LargeProjectBookingPlannerCalendar = ({ projectId }: Props) => {
  return (
    <Card className="border-border/60 rounded-none">
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <CardTitle className="text-base">Intern bokningsplanering</CardTitle>
        <Badge variant="outline" className="text-[10px]">Under utveckling</Badge>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>
          Isolerad planerare för bokningar och tasks <em>inuti</em> ett stort
          projekt. Påverkar inte personalkalenderns tilldelningar.
        </p>
        <p className="text-xs">
          Projekt-id: <code>{projectId}</code>
        </p>
      </CardContent>
    </Card>
  );
};

export default LargeProjectBookingPlannerCalendar;
