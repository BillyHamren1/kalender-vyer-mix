// booking-cancellation-watch
// ------------------------------------------------------------------
// Gör avbokningar i Booking SYNLIGA i planeringen — utan automatisk
// destruktiv sync.
//
//   action=scan   → läser canonical status per bokning och registrerar
//                   kandidater i booking_cancellation_candidates.
//                   INGA mutationer på bokningar/kalender/projekt.
//   action=apply  → en inloggad människa bekräftar EN avbokning.
//                   Servern verifierar mot Booking igen och kör den enda
//                   skrivvägen: applyBookingCancellation (manualApproval).
//   action=dismiss→ döljer kandidaten utan att avboka.
//
// Multi-tenant: organisationen härleds ur den inloggade användarens profil.
// Bokningar utanför den organisationen rörs aldrig.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyBookingCancellation } from "../_shared/cancellation-handler.ts";
import { loadAppliedSourceRevision } from "../_shared/appliedSourceRevision.ts";
import { evaluateDestructiveAction } from "../_shared/singleBookingSource.ts";
import { fetchExternalStatus } from "./externalStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCAN_MAX_BOOKINGS = 60;
const SCAN_CONCURRENCY = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveCaller(req: Request, admin: any) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "missing_authorization" as const };

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) return { error: "invalid_token" as const };

  const userId = userData.user.id as string;
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) return { error: "profile_read_failed" as const };
  if (!profile?.organization_id) return { error: "organization_unresolved" as const };

  return { userId, organizationId: profile.organization_id as string };
}

/** Läser canonical status för EN bokning. Returnerar kandidatbeslut. */
async function inspectBooking(
  admin: any,
  importApiKey: string,
  booking: { id: string; organization_id: string; status: string | null },
) {
  const ext = await fetchExternalStatus(booking.id, booking.organization_id, importApiKey);
  if (!ext.ok) return { kind: "error" as const, error: ext.error };

  const revisionLoad = await loadAppliedSourceRevision(admin, booking.id, booking.organization_id);
  if (!revisionLoad.ok) return { kind: "error" as const, error: `applied_revision:${revisionLoad.error}` };

  const decision = evaluateDestructiveAction(
    ext.parsed,
    { bookingId: booking.id, organizationId: booking.organization_id },
    revisionLoad.found ? revisionLoad.revisions : null,
  );

  if (decision.allowed && decision.action === "cancellation") {
    return {
      kind: "cancelled" as const,
      sourceStatus: decision.tombstone.source_status ?? "CANCELLED",
      sourceRevision:
        decision.tombstone.source_updated_at ?? decision.tombstone.source_version ?? null,
      sourceUpdatedAt: decision.tombstone.source_updated_at ?? null,
      sourceVersion: decision.tombstone.source_version ?? null,
    };
  }
  return { kind: "not_cancelled" as const, reason: decision.allowed ? "other" : decision.reason };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const importApiKey = Deno.env.get("IMPORT_API_KEY");
  if (!importApiKey) return json({ error: "IMPORT_API_KEY missing" }, 500);

  const admin = createClient(supabaseUrl, serviceKey);

  const caller = await resolveCaller(req, admin);
  if ("error" in caller) return json({ error: caller.error }, 401);
  const { organizationId, userId } = caller;

  const body = await req.json().catch(() => ({} as any));
  const action = typeof body?.action === "string" ? body.action : "scan";

  // ── SCAN ──────────────────────────────────────────────────────────
  if (action === "scan") {
    const requestedIds: string[] = Array.isArray(body?.booking_ids)
      ? body.booking_ids.filter((v: unknown) => typeof v === "string").slice(0, SCAN_MAX_BOOKINGS)
      : [];

    let query = admin
      .from("bookings")
      .select("id, organization_id, status, booking_number, client")
      .eq("organization_id", organizationId)
      .in("status", ["CONFIRMED", "OFFER"])
      .limit(SCAN_MAX_BOOKINGS);
    if (requestedIds.length > 0) query = query.in("id", requestedIds);

    const { data: bookings, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const rows = bookings ?? [];
    const detected: string[] = [];
    const cleared: string[] = [];
    const errors: Array<{ booking_id: string; error: string }> = [];

    for (let i = 0; i < rows.length; i += SCAN_CONCURRENCY) {
      const slice = rows.slice(i, i + SCAN_CONCURRENCY);
      await Promise.all(
        slice.map(async (b: any) => {
          const res = await inspectBooking(admin, importApiKey, b);
          if (res.kind === "error") {
            errors.push({ booking_id: b.id, error: res.error });
            return;
          }
          if (res.kind === "cancelled") {
            const { error: upsertErr } = await admin
              .from("booking_cancellation_candidates")
              .upsert(
                {
                  organization_id: organizationId,
                  booking_id: b.id,
                  booking_number: b.booking_number ?? null,
                  client: b.client ?? null,
                  source_revision: res.sourceRevision === null ? null : String(res.sourceRevision),
                  source_status: res.sourceStatus,
                  status: "pending",
                  detected_at: new Date().toISOString(),
                  resolved_at: null,
                  resolved_by: null,
                },
                { onConflict: "organization_id,booking_id" },
              );
            if (upsertErr) errors.push({ booking_id: b.id, error: upsertErr.message });
            else detected.push(b.id);
            return;
          }
          // Inte avbokad längre → städa bort ev. gammal pending-kandidat.
          const { error: delErr } = await admin
            .from("booking_cancellation_candidates")
            .delete()
            .eq("organization_id", organizationId)
            .eq("booking_id", b.id)
            .eq("status", "pending");
          if (!delErr) cleared.push(b.id);
        }),
      );
    }

    return json({
      success: true,
      inspected: rows.length,
      detected: detected.length,
      cleared: cleared.length,
      errors,
    });
  }

  // ── DISMISS ───────────────────────────────────────────────────────
  if (action === "dismiss") {
    const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
    if (!bookingId) return json({ error: "booking_id_required" }, 400);
    const { error } = await admin
      .from("booking_cancellation_candidates")
      .update({ status: "dismissed", resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq("organization_id", organizationId)
      .eq("booking_id", bookingId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, outcome: "dismissed" });
  }

  // ── APPLY (människa bekräftar EN avbokning) ───────────────────────
  if (action === "apply") {
    const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
    if (!bookingId) return json({ error: "booking_id_required" }, 400);

    const { data: booking, error: readErr } = await admin
      .from("bookings")
      .select("id, version, status, organization_id, assigned_to_project, assigned_project_id, assigned_project_name")
      .eq("id", bookingId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (readErr) return json({ error: `booking_read_failed:${readErr.message}` }, 500);
    if (!booking) return json({ error: "booking_not_found_in_organization" }, 404);

    if (String(booking.status ?? "").toUpperCase() === "CANCELLED") {
      await admin
        .from("booking_cancellation_candidates")
        .update({ status: "applied", resolved_at: new Date().toISOString(), resolved_by: userId })
        .eq("organization_id", organizationId)
        .eq("booking_id", bookingId);
      return json({ success: true, outcome: "already_cancelled" });
    }

    // Verifiera mot källan IGEN — UI:t får aldrig vara enda beviset.
    const res = await inspectBooking(admin, importApiKey, booking as any);
    if (res.kind === "error") return json({ error: `source_check_failed:${res.error}` }, 502);
    if (res.kind !== "cancelled") {
      return json({ error: "source_not_cancelled", reason: res.reason }, 409);
    }

    const result = await applyBookingCancellation(
      admin,
      booking as any,
      {
        reason: "cancelled",
        source_status: res.sourceStatus,
        source_revision: res.sourceRevision,
        source_updated_at: res.sourceUpdatedAt,
        source_version: res.sourceVersion,
        organization_id: organizationId,
      },
      { manualApproval: true, approvedBy: userId },
    );

    if (result.status === "cancelled" || result.status === "skipped_already_cancelled") {
      await admin
        .from("booking_cancellation_candidates")
        .update({ status: "applied", resolved_at: new Date().toISOString(), resolved_by: userId })
        .eq("organization_id", organizationId)
        .eq("booking_id", bookingId);
      return json({ success: true, outcome: result.outcome ?? result.status });
    }

    return json({ error: result.error ?? "cancellation_failed", outcome: result.outcome }, 500);
  }

  return json({ error: `unknown_action:${action}` }, 400);
});
