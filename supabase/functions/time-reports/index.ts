// ⚠️ DEPRECATED — DO NOT USE
//
// This Edge Function previously exposed generic CRUD against `time_reports`
// using the service role key. That bypassed the official time-reporting
// architecture (save-then-stop, soft active-timer guard, datetime overlap,
// approved-lock, unified time model).
//
// OFFICIAL WRITE PATHS for time_reports (create / update / delete):
//   - Mobile:  supabase/functions/mobile-app-api  (actions: create_time_report, update_time_report, delete_time_report)
//   - Admin/Web: same `mobile-app-api` (actions: admin_create_time_report, admin_delete_time_report)
//                — invoked via src/services/projectStaffService.ts -> mobileApiService.ts
//   - Database safety net: triggers `trg_time_reports_overlap` and
//     `trg_time_reports_approved_lock` on public.time_reports.
//
// READS for time_reports go directly through the Supabase client (RLS-protected).
//
// This function now refuses every request with HTTP 410 Gone so that any
// forgotten caller fails loudly instead of silently bypassing the rules.

import { corsHeaders } from '../_shared/cors.ts'

const DEPRECATION_NOTICE = {
  error: 'Gone',
  message:
    'The `time-reports` edge function has been retired. ' +
    'Use `mobile-app-api` for create/update/delete of time_reports ' +
    '(actions: create_time_report, update_time_report, delete_time_report, ' +
    'admin_create_time_report, admin_delete_time_report). ' +
    'Read time_reports directly via the Supabase client (RLS).',
  official_write_path: 'mobile-app-api',
  retired_at: '2026-04-18',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  console.warn(
    `[time-reports] BLOCKED ${req.method} ${new URL(req.url).pathname} — function is retired.`
  )

  return new Response(JSON.stringify(DEPRECATION_NOTICE), {
    status: 410, // Gone
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
