

## Problem

`sync-reconciliation` reads field names directly from the raw `export_bookings` API response (e.g. `ext.rigdaydate`, `ext.deliveryaddress`, `ext.client`), but the external API uses **different field names**:

| sync-reconciliation expects | External API actually sends |
|---|---|
| `client` | `clientName` or `client.name` (object) |
| `deliveryaddress` | `delivery_address` |
| `rigdaydate` | `rig_up_dates` (array) or `rig_up_date` |
| `eventdate` | `event_dates` (array) or `event_date` |
| `rigdowndate` | `rig_down_dates` (array) or `rig_down_date` |
| `internalnotes` | `internal_notes` |
| `rig_start_time` | `rig_up_start_time` or combined `rig_up_time` |
| `rigdown_start_time` | `rig_down_start_time` or combined `rig_down_time` |
| `contact_name` | Unknown — needs check |
| `status` | Needs normalization (BEKRÄFTAD → CONFIRMED) |

The `import-bookings` function already has all the correct mapping logic (lines 2080-2180). `sync-reconciliation` skips this mapping entirely, so every external field appears null/empty → false discrepancies everywhere.

## Solution

Add a **normalize function** in `sync-reconciliation` that applies the same field mapping as `import-bookings` to each external booking **before** comparison. This means:

1. **Normalize external bookings** after fetching from `export_bookings`:
   - `clientName` / `client.name` → `client`
   - `delivery_address` → `deliveryaddress`
   - `rig_up_dates[0]` / `rig_up_date` → `rigdaydate`
   - `event_dates[0]` / `event_date` → `eventdate`
   - `rig_down_dates[0]` / `rig_down_date` → `rigdowndate`
   - `internal_notes` → `internalnotes`
   - Time fields: same priority chain as import-bookings (discrete → combined range → null)
   - Status: normalize BEKRÄFTAD → CONFIRMED, AVBOKAD → CANCELLED
   - Contact fields mapping
   - Product field name alignment

2. **Single file change**: `supabase/functions/sync-reconciliation/index.ts` — add a `normalizeExternalBooking()` helper and call it on each booking before comparison.

3. **Deploy** the updated edge function.

## Technical Detail

The normalizer will mirror the exact logic from `import-bookings` lines 2080-2182, extracting:
- Client name from `clientName` or `client.name`
- Dates from array-first format with single-field fallbacks
- Time fields with the same priority chain and `parseTimeRange` for combined fields
- Address from `delivery_address`
- Notes from `internal_notes`
- Status normalization

No other files need changes — the UI and apply logic remain the same.

