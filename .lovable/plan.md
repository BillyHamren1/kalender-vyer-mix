

## Plan: Editable category field with custom categories

### Problem
The category dropdown is hardcoded with fixed values. User wants to type custom categories and have them saved, with new defaults: **Montering**, **Demontering**, **Transport**.

### Changes

**1. `src/components/project/ActivityPlannerSheet.tsx`**
- Replace the `CATEGORIES` constant with new defaults: `montering`, `demontering`, `transport`
- Replace the `<Select>` for category with a combo-box pattern: an `<Input>` with a datalist or a custom dropdown that shows existing categories + allows free text input
- Use a simple approach: `<Input>` with autocomplete suggestions from a combined list of defaults + previously used categories fetched from the DB
- Add a query to fetch distinct categories from `establishment_tasks` table to populate suggestions

**2. `src/components/project/AddEstablishmentTaskDialog.tsx`**
- Same change: update default categories to montering/demontering/transport and switch to free-text input with suggestions

**3. `src/components/project/ProjectGanttChart.tsx`**
- Update `CATEGORY_CONFIG` to handle unknown/custom categories gracefully with a fallback color instead of crashing on missing keys

### Implementation detail
- Use a `<Popover>` + `<Input>` + filtered list pattern (combobox) so the user can either pick a suggestion or type freely
- Fetch `SELECT DISTINCT category FROM establishment_tasks` to show previously saved custom categories as suggestions
- Merge DB categories with the 3 defaults for the suggestion list
- The category value is stored as-is (free text) in the `category` column

