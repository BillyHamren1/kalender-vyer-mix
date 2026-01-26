
# Plan: Advanced Warehouse Dashboard with Packing Management

## Overview
This plan creates an advanced warehouse dashboard that provides a comprehensive overview of logistics operations, packing task management, and the ability to create packing lists directly from booking events in the warehouse calendar.

---

## Part 1: Advanced Warehouse Dashboard

### 1.1 New Service: Warehouse Dashboard Service
Create a dedicated service file `src/services/warehouseDashboardService.ts` that fetches warehouse-specific data:

```text
+----------------------------------------------------------+
|           warehouseDashboardService.ts                   |
+----------------------------------------------------------+
| - fetchWarehouseStats()                                  |
|   => Counts for upcoming jobs, packings by status        |
| - fetchUpcomingPackings()                                |
|   => Packings sorted by event date                       |
| - fetchUrgentPackings()                                  |
|   => Packings with approaching deadlines (3-7 days)      |
| - fetchActivePackings()                                  |
|   => Packings with status 'in_progress'                  |
| - fetchPackingTasksByDeadline()                          |
|   => All packing tasks with upcoming deadlines           |
| - fetchRecentWarehouseActivity()                         |
|   => Recent packing/task updates                         |
+----------------------------------------------------------+
```

**Key Data Queries:**
- **Upcoming Jobs**: Bookings with event dates in the next 14 days
- **Urgent Packings**: Packings where the related booking's rigdaydate is within 7 days AND packing status is not 'completed'
- **In-Progress Packings**: Filter packing_projects where status = 'in_progress'
- **Overdue Tasks**: packing_tasks where deadline < today AND completed = false

### 1.2 New Hook: useWarehouseDashboard
Create `src/hooks/useWarehouseDashboard.tsx` following the pattern from `useDashboard.tsx`:

```text
Hook Structure:
- statsQuery        -> Warehouse stats (counts)
- upcomingQuery     -> Upcoming jobs timeline
- urgentQuery       -> Urgent/approaching packings
- activeQuery       -> Active packings list
- tasksQuery        -> Tasks needing attention
- activityQuery     -> Recent activity feed
```

### 1.3 Dashboard UI Components
Create new components in `src/components/warehouse-dashboard/`:

| Component | Description |
|-----------|-------------|
| **WarehouseStatsRow** | Stats cards: Upcoming jobs, Active packings, Urgent packings, Overdue tasks |
| **UpcomingJobsTimeline** | 7-day timeline showing packing deadlines and delivery dates |
| **UrgentPackingsList** | Highlights packings with approaching deadlines, color-coded by urgency |
| **ActivePackingsGrid** | Cards showing in-progress packings with progress indicators |
| **PackingTasksAttention** | List of overdue and upcoming packing tasks |
| **QuickActionsPanel** | Buttons for creating new packings, viewing calendar |

### 1.4 Urgency Logic
Packings will be classified by urgency based on days until rig day:
- **Critical (red)**: Less than 3 days to rig date
- **Urgent (orange)**: 3-5 days to rig date
- **Approaching (yellow)**: 5-7 days to rig date
- **Normal (gray)**: More than 7 days

### 1.5 Dashboard Layout (Desktop)
```text
+----------------------------------------------------------+
|                 WAREHOUSE DASHBOARD                        |
+----------------------------------------------------------+
| [Stats] [Stats] [Stats] [Stats]                           |
| Jobb    Aktiva  Akuta   Förfall.                          |
| 12      5       3       2                                 |
+----------------------------------------------------------+
|                                                            |
| [Upcoming Jobs Timeline - 7 days horizontal scroll]        |
|                                                            |
+----------------------------------------------------------+
| [Urgent Packings]        | [Tasks Needing Attention]      |
| - Critical items         | - Overdue tasks                |
| - Warning items          | - Due today/tomorrow           |
+---------------------------+--------------------------------+
| [Active Packings Grid]                                     |
| [Card] [Card] [Card] [Card]                               |
| Progress bars and status                                   |
+----------------------------------------------------------+
```

---

## Part 2: Booking Products Dialog in Warehouse Calendar

### 2.1 New Component: BookingProductsDialog
Create `src/components/Calendar/BookingProductsDialog.tsx`:

When a booking event is clicked in the warehouse calendar, instead of navigating away, show a dialog with:
- Booking header (client, booking number, dates)
- Full product list with quantities and notes
- Quick action: "Create Packing from this Booking"

### 2.2 Modify Event Click Behavior
Update `src/pages/WarehouseCalendarPage.tsx` to:
1. Intercept event clicks
2. Fetch booking products via `fetchBookingById`
3. Display the BookingProductsDialog

### 2.3 Dialog Structure
```text
+----------------------------------------------------------+
| [X]    Booking: Tjipp AB - #2506-4                        |
|----------------------------------------------------------|
| Event Date: 18 Nov 2025                                   |
| Rig Date: 17 Nov | Rigdown: 23 Nov                       |
| Address: Venngarn, Sigtuna                               |
|----------------------------------------------------------|
| PRODUCTS TO PACK:                                         |
| +------------------------------------------------------+ |
| | Multiflex 10x15              Qty: 2                  | |
| | F20 - 20x30                  Qty: 1                  | |
| | Kassettgolv 10x15            Qty: 1                  | |
| +------------------------------------------------------+ |
|----------------------------------------------------------|
| [Create Packing]  [View Full Booking Details]            |
+----------------------------------------------------------+
```

### 2.4 Quick Packing Creation
The "Create Packing" button will:
1. Pre-populate the CreatePackingWizard with booking data
2. Pass the booking_id to link the packing
3. Open the wizard dialog

---

## Part 3: Implementation Steps

### Step 1: Create Warehouse Dashboard Service
- New file: `src/services/warehouseDashboardService.ts`
- Implement all fetch functions with Supabase queries
- Handle joins with bookings and packing_tasks tables

### Step 2: Create Warehouse Dashboard Hook
- New file: `src/hooks/useWarehouseDashboard.tsx`
- Parallel queries with react-query
- 30-second auto-refresh

### Step 3: Create Dashboard Components
- `src/components/warehouse-dashboard/WarehouseStatsRow.tsx`
- `src/components/warehouse-dashboard/UpcomingJobsTimeline.tsx`
- `src/components/warehouse-dashboard/UrgentPackingsList.tsx`
- `src/components/warehouse-dashboard/ActivePackingsGrid.tsx`
- `src/components/warehouse-dashboard/PackingTasksAttention.tsx`

### Step 4: Update WarehouseDashboard Page
- Replace current simple card layout with advanced dashboard
- Use amber color scheme for consistency with warehouse theme

### Step 5: Create Booking Products Dialog
- New file: `src/components/Calendar/BookingProductsDialog.tsx`
- Fetch products on dialog open
- Include create packing action

### Step 6: Update Warehouse Calendar Event Handling
- Modify click behavior to show product dialog
- Pass booking data to dialog component

---

## Technical Notes

### Database Queries
The dashboard will query these tables:
- `bookings` - for upcoming jobs
- `packing_projects` - for packing status tracking
- `packing_tasks` - for task deadlines
- `booking_products` - for product lists in dialogs

### No Database Changes Required
All required tables and columns already exist. The implementation uses existing schema.

### Styling
- Amber color palette for warehouse theme
- Matches existing WarehouseCalendarPage styling
- Uses warehouse tailwind color class (bg-warehouse, text-warehouse)
