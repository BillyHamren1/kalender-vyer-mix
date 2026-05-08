// @ts-nocheck
/**
 * location-update-cron — LEGACY / DISABLED
 * ────────────────────────────────────────────────────────────────────────────
 * DEPRECATED. Tidigare safety-net som körde processStaffLocationUpdate →
 * process-location-auto-start → workdays / location_time_entries /
 * travel_time_logs.
 *
 * Den kedjan är AVSLAGEN. Nya Time Engine
 * (processGpsTimelineForAutoStart → active_time_registrations) körs synkront
 * från `mobile-app-api :: handleUploadLocationBatch` efter varje GPS-batch
 * och behöver ingen separat cron-fallback.
 *
 * Funktionen finns kvar enbart som no-op shim så pg_cron-schemat inte
 * kraschar. Den får INTE anropa processStaffLocationUpdate,
 * process-location-auto-start eller röra workdays/LTE/travel.
 *
 * Ta bort helt när cron-schemat är borttaget.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      ok: false,
      disabled: true,
      reason: "legacy cron disabled, use Time Engine",
      replacement: "mobile-app-api :: handleUploadLocationBatch → processGpsTimelineForAutoStart → active_time_registrations",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
