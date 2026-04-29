---
name: Staff Calendar Single Writer
description: Endast staffAssignmentCore.ts skriver till staff_assignments. Hook (useUnifiedStaffOperations) och services (staffService, unifiedStaffService) delegerar dit. Låst av staffCalendar.contract.test.ts.
type: constraint
---

**ENDA skrivvägen** till `public.staff_assignments` är `src/services/staffAssignmentCore.ts` med funktionerna `assignStaffToTeamCore` och `removeStaffAssignmentCore`.

Alla andra vägar delegerar dit:
- `useUnifiedStaffOperations.handleStaffDrop` (canonical hook med optimistic update)
- `services/staffService.assignStaffToTeam / removeStaffAssignment`
- `services/unifiedStaffService.assignStaffToTeam / removeStaffAssignment`

**Borttagna duplikater (återinför EJ):**
- `src/hooks/useReliableStaffOperations.ts`
- `src/hooks/useDateAwareStaffOperations.tsx`
- `src/hooks/useStaffOperations.tsx`
- `src/services/enhancedStaffService.ts`
- `src/components/Calendar/StaffAssignmentRow.tsx`
- `src/components/Calendar/StaffConnectionValidator.tsx`
- `src/hooks/useStaffBookingConnection.tsx`
- `src/lib/staffCalendar/{enhancedStaffService,projectStaffService,staffAssignmentService,staffAvailabilityService,staffCalendarService,staffDashboardService,staffImportService,staffRevenueService,staffRouteService,staffService,unifiedStaffService}.ts`
  (endast `deriveStaffEvents.ts` finns kvar i lib/staffCalendar/)

**Edge function `staff-management`** används INTE längre för assign/remove (kvar för booking-export, summaries, get_available_staff).

**Multi-team policy** (samma som tidigare): upsert på `(staff_id, team_id, assignment_date)`, remove med valfritt `teamId` = bara den raden.

**Why:** Tidigare hade vi 5 hooks och 4 services som alla skrev direkt till tabellen. Olika optimistic update-strategier gjorde att jobb "flyttades" eller "försvann" beroende på var i UI:t klicket gjordes.

**Locked by:** `src/test/staffCalendar.contract.test.ts`.
