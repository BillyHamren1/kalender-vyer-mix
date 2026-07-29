// @ts-nocheck
/**
 * Shared batch helpers for booking-import synk-flödet.
 *
 * ANSVAR
 * - createBatch: skapar en `sync_batches`-rad + returnerar id.
 * - attachJobsToBatch: säkerställer att det finns EXAKT ett aktivt jobb per
 *   (org, booking) och kopplar det via `sync_batch_jobs` (many-to-many).
 *   Samma jobb får tillhöra flera batcher samtidigt — batchen B som "hittar"
 *   en bokning som redan har ett aktivt jobb i batch A kopplar sig till samma
 *   jobb i stället för att skapa dubblettarbete.
 * - finalizeBatchIfDone: delegerar till RPC:n `finalize_sync_batch` som kör
 *   räkning + statusuppdatering + monoton cursor i EN transaktion med radlås.
 *
 * CURSOR-POLICY (server-authoritative)
 *   - Alla jobb success  → sync_state.last_sync_timestamp = planned_cursor
 *                          (bara om planned_cursor > existing).
 *   - Något jobb permanent failed → last_sync_status='partial',
 *                          last_sync_timestamp lämnas orörd.
 *   - Tom batch → success + cursor advances.
 *   - Retriable failed räknas som "pending" (batchen väntar på retry).
 *
 * Cursor rör sig ALDRIG bakåt (garanterat av RPC:n).
 */

export interface CreateBatchOpts {
  organizationId: string;
  syncType: string;
  plannedCursor: string; // ISO-8601
  metadata?: Record<string, unknown>;
}

export interface FinalizeResult {
  batchId: string;
  remaining: number;
  succeeded: number;
  failed: number;
  finalized: boolean;
  status: "pending" | "success" | "partial" | "failed" | "unknown";
  cursorAdvancedTo: string | null;
  monotonicSkip: boolean;
}

export async function createBatch(
  supabase: any,
  opts: CreateBatchOpts,
): Promise<string> {
  const { data, error } = await supabase
    .from("sync_batches")
    .insert({
      organization_id: opts.organizationId,
      sync_type: opts.syncType,
      planned_cursor: opts.plannedCursor,
      status: "pending",
      metadata: opts.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`createBatch failed: ${error.message}`);
  return data.id as string;
}

/**
 * För varje kandidat: (a) säkerställ att det finns ett aktivt jobb (pending/
 * processing) via upsert med partial unique index; (b) koppla det jobbet till
 * denna batch i `sync_batch_jobs`. Idempotent — säkert att anropa flera gånger
 * per batch och tål concurrent race där två imports skapar jobb parallellt.
 *
 * @param eventType — sätts på nya jobb; ignoreras när jobbet redan fanns.
 * @param batchIdForNewJobs — sätts som legacy `booking_sync_jobs.batch_id` för
 *                             nya jobb (bakåtkompat), men finaliseringen läser
 *                             ENDAST från `sync_batch_jobs`.
 */
export async function attachJobsToBatch(
  supabase: any,
  batchId: string,
  organizationId: string,
  bookingIds: string[],
  eventType: string | null = null,
  batchIdForNewJobs: string | null = null,
): Promise<{ totalJobs: number; adoptedExisting: number; createdNew: number }> {
  let adopted = 0;
  let created = 0;

  for (const bookingId of bookingIds) {
    let jobId: string | null = null;

    // 1. Försök hitta befintligt aktivt jobb (pending eller processing).
    const { data: existing, error: existingErr } = await supabase
      .from("booking_sync_jobs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("booking_id", bookingId)
      .in("status", ["pending", "processing"])
      .maybeSingle();

    if (existingErr) {
      console.warn(
        `[syncBatch] lookup existing job failed org=${organizationId} booking=${bookingId}: ${existingErr.message}`,
      );
    }

    if (existing?.id) {
      jobId = existing.id;
      adopted++;
    } else {
      // 2. Ingen aktiv rad — försök skapa. Partial unique index kan avvisa
      //    om en parallell import hann skapa raden mellan vår select och insert.
      const { data: inserted, error: insertErr } = await supabase
        .from("booking_sync_jobs")
        .insert({
          booking_id: bookingId,
          organization_id: organizationId,
          event_type: eventType ?? "booking.incremental",
          status: "pending",
          batch_id: batchIdForNewJobs, // legacy fält, ej auktoritativt
        })
        .select("id")
        .single();

      if (insertErr) {
        // 23505 = unique_violation (race med annan importer)
        const { data: retryExisting } = await supabase
          .from("booking_sync_jobs")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("booking_id", bookingId)
          .in("status", ["pending", "processing"])
          .maybeSingle();

        if (retryExisting?.id) {
          jobId = retryExisting.id;
          adopted++;
        } else {
          console.warn(
            `[syncBatch] failed to insert or find active job for org=${organizationId} booking=${bookingId}: ${insertErr.message}`,
          );
          continue;
        }
      } else if (inserted?.id) {
        jobId = inserted.id;
        created++;
      }
    }

    if (!jobId) continue;

    // 3. Koppla jobbet till denna batch (idempotent).
    const { error: linkErr } = await supabase
      .from("sync_batch_jobs")
      .upsert(
        { batch_id: batchId, job_id: jobId },
        { onConflict: "batch_id,job_id", ignoreDuplicates: true },
      );
    if (linkErr) {
      console.warn(
        `[syncBatch] link batch=${batchId} job=${jobId} failed: ${linkErr.message}`,
      );
    }
  }

  // Räkna totalt antal jobb (via kopplingstabellen — samma källa som RPC).
  const { count, error: countErr } = await supabase
    .from("sync_batch_jobs")
    .select("job_id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  if (countErr) {
    console.warn(
      `[syncBatch] count failed for batch=${batchId}: ${countErr.message}`,
    );
  }

  const totalJobs = count ?? 0;

  await supabase
    .from("sync_batches")
    .update({ total_jobs: totalJobs })
    .eq("id", batchId);

  console.log(
    `[syncBatch] batch=${batchId} attached total=${totalJobs} adopted=${adopted} created=${created}`,
  );

  return { totalJobs, adoptedExisting: adopted, createdNew: created };
}

/**
 * Delegerar till DB-RPC `finalize_sync_batch` som atomiskt låser batchraden,
 * räknar jobb via `sync_batch_jobs`, uppdaterar batchen och driver monoton
 * cursor. Två samtidiga workers blockeras av radlåset — endast en effekt.
 */
export async function finalizeBatchIfDone(
  supabase: any,
  batchId: string,
): Promise<FinalizeResult> {
  const { data, error } = await supabase.rpc("finalize_sync_batch", {
    _batch_id: batchId,
  });

  if (error) {
    console.warn(
      `[syncBatch] finalize_sync_batch RPC failed for batch=${batchId}: ${error.message}`,
    );
    return {
      batchId,
      remaining: -1,
      succeeded: 0,
      failed: 0,
      finalized: false,
      status: "pending",
      cursorAdvancedTo: null,
      monotonicSkip: false,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      batchId,
      remaining: 0,
      succeeded: 0,
      failed: 0,
      finalized: false,
      status: "unknown",
      cursorAdvancedTo: null,
      monotonicSkip: false,
    };
  }

  const result: FinalizeResult = {
    batchId,
    remaining: Number(row.remaining ?? 0),
    succeeded: Number(row.succeeded ?? 0),
    failed: Number(row.failed ?? 0),
    finalized: Boolean(row.finalized),
    status: (row.status ?? "pending") as FinalizeResult["status"],
    cursorAdvancedTo: row.cursor_advanced_to ?? null,
    monotonicSkip: Boolean(row.monotonic_skip),
  };

  if (result.finalized) {
    console.log(
      `[syncBatch] batch=${batchId} finalized status=${result.status} ` +
        `succeeded=${result.succeeded} failed=${result.failed} ` +
        `cursor_advanced_to=${result.cursorAdvancedTo ?? "HELD"} ` +
        `monotonic_skip=${result.monotonicSkip}`,
    );
  }

  return result;
}
