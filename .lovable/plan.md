

## Plan: Unified project list sorted by date

### What changes
Replace the three-column layout on `/projects` with a single unified list that:
1. Merges all projects (small/medium/large) into one list sorted by event date
2. Shows a type badge per row (Litet / Medel / Stort) with distinct colors
3. Adds a project type filter (toggle/select) alongside the existing search and status filter
4. Keeps "Nytt projekt" button and IncomingBookingsList as-is

### Implementation

**New component: `src/components/project/UnifiedProjectList.tsx`**
- Fetches from all three sources: `fetchJobs`, `fetchProjects`, `fetchLargeProjects`
- Normalizes into a common shape: `{ id, name, type: 'small'|'medium'|'large', date, status, clientOrLocation, navigateTo }`
- Sorts by date (event date for small/medium, start_date for large)
- Filters by: search text, status (active/planning/in_progress/completed/all), project type
- Renders a flat list with type badge, date, name, and chevron
- Delete functionality per row (calls the appropriate delete function based on type)

**Update `src/pages/ProjectManagement.tsx`**
- Replace the three-column grid with `<UnifiedProjectList />`
- Move global search/status filter into the new component (or keep in page and pass as props)
- Add a type filter (Alla / Litet / Medel / Stort)

**Keep existing panels** untouched (still used by `ProjectArchive.tsx`).

### UI per row
```text
[Type Badge] | Project Name          | Date        | [Delete] [>]
 Medel       | A Catering Sweden AB  | 26 feb 2026 |          >
 Litet       | 11 - TEST - !! #2602  | 18 feb 2026 |          >
 Stort       | Swedish game fair     | 3 bokningar |          >
```

Type badges: Litet = blue, Medel = teal, Stort = purple.

