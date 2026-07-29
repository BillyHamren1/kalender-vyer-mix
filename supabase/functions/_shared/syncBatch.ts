// @ts-nocheck
/**
 * Shared batch helpers for booking-import synk-flödet.
 *
 * Ansvar:
 * - createBatch: skapa en `sync_batches`-rad + returnera id.
 * - attachJobsToBatch: adoptera existerande pending/processing-jobb till batchen
 *   (så coalesced jobb räknas med) + räkna totalt antal jobb.
 * - finalizeBatchIfDone: kolla om alla jobb i batchen är terminala; om ja,
 *   avancera cursor endast om inga jobb misslyckades.
 *
 * Cursor-policy:
 *   - ALLA jobb i batchen success  → sync_state.last_sync_timestamp = planned_cursor,
 *                                    last_sync_status = 'success'
 *   - ANY jobb i batchen failed    → sync_state.last_sync_status = 'partial',
 *                                    last_sync_timestamp lämnas orörd (kvar på
 *                                    föregående lyckade batch).
 *   - tomma batchar (total_jobs=0) → 'success' + avancera cursor direkt.
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
  status: "pending" | "success" | "partial" | "failed";
  cursorAdvancedTo: string | null;
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
 * Adopt any pending/processing job for this org+booking set into the batch,
 * then recompute total_jobs on the batch row.
 */
export async function attachJobsToBatch(
  supabase: any,
  batchId: string,
  organizationId: string,
  bookingIds: string[],
): Promise<{ totalJobs: number }> {
  if (bookingIds.length > 0) {
    const { error: adoptErr } = await supabase
      .from("booking_sync_jobs")
      .update({ batch_id: batchId })
      .is("batch_id", null)
      .eq("organization_id", organizationId)
      .in("booking_id", bookingIds)
      .in("status", ["pending", "processing"]);
    if (adoptErr) {
      console.warn(
        `[syncBatch] attachJobsToBatch adopt failed for batch=${batchId}: ${adoptErr.message}`,
      );
    }
  }

  const { count, error: countErr } = await supabase
    .from("booking_sync_jobs")
    .select("id", { count: "exact", head: true })
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

  return { totalJobs };
}

/**
 * Called by process-sync-jobs after each job flips to completed/failed.
 * Idempotent — safe to call from multiple workers; the final cursor write
 * uses an UPSERT with per-org conflict target.
 */
export async function finalizeBatchIfDone(
  supabase: any,
  batchId: string,
): Promise<FinalizeResult> {
  const { data: batchRow, error: batchErr } = await supabase
    .from("sync_batches")
    .select("id, organization_id, sync_type, planned_cursor, status")
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr || !batchRow) {
    return {
      batchId,
      remaining: 0,
      succeeded: 0,
      failed: 0,
      finalized: false,
      status: "pending",
      cursorAdvancedTo: null,
    };
  }

  // If already finalized, no-op.
  if (batchRow.status !== "pending") {
    return {
      batchId,
      remaining: 0,
      succeeded: 0,
      failed: 0,
      finalized: false,
      status: batchRow.status,
      cursorAdvancedTo: null,
    };
  }

  const { data: jobs, error: jobsErr } = await supabase
    .from("booking_sync_jobs")
    .select("status")
    .eq("batch_id", batchId);

  if (jobsErr) {
    console.warn(
      `[syncBatch] finalize count failed for batch=${batchId}: ${jobsErr.message}`,
    );
    return {
      batchId,
      remaining: -1,
      succeeded: 0,
      failed: 0,
      finalized: false,
      status: "pending",
      cursorAdvancedTo: null,
    };
  }

  let remaining = 0;
  let succeeded = 0;
  let failed = 0;
  for (const j of jobs ?? []) {
    if (j.status === "pending" || j.status === "processing") remaining++;
    else if (j.status === "completed") succeeded++;
    else if (j.status === "failed") failed++;
  }

  // Empty batches (total_jobs=0) finalize as success and advance cursor.
  if ((jobs?.length ?? 0) === 0) {
    await supabase
      .from("sync_batches")
      .update({
        status: "success",
        succeeded_jobs: 0,
        failed_jobs: 0,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId)
      .eq("status", "pending");

    await supabase
      .from("sync_state")
      .upsert(
        {
          sync_type: batchRow.sync_type,
          organization_id: batchRow.organization_id,
          last_sync_timestamp: batchRow.planned_cursor,
          last_sync_status: "success",
          metadata: { batch_id: batchId, cursor_advanced_to: batchRow.planned_cursor, empty_batch: true },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,sync_type" },
      );

    return {
      batchId,
      remaining: 0,
      succeeded: 0,
      failed: 0,
      finalized: true,
      status: "success",
      cursorAdvancedTo: batchRow.planned_cursor,
    };
  }

  if (remaining > 0) {
    return {
      batchId,
      remaining,
      succeeded,
      failed,
      finalized: false,
      status: "pending",
      cursorAdvancedTo: null,
    };
  }

  const finalStatus: "success" | "partial" = failed === 0 ? "success" : "partial";
  const nowIso = new Date().toISOString();

  await supabase
    .from("sync_batches")
    .update({
      status: finalStatus,
      succeeded_jobs: succeeded,
      failed_jobs: failed,
      completed_at: nowIso,
    })
    .eq("id", batchId)
    .eq("status", "pending"); // only finalize once

  if (finalStatus === "success") {
    await supabase
      .from("sync_state")
      .upsert(
        {
          sync_type: batchRow.sync_type,
          organization_id: batchRow.organization_id,
          last_sync_timestamp: batchRow.planned_cursor,
          last_sync_status: "success",
          metadata: {
            batch_id: batchId,
            cursor_advanced_to: batchRow.planned_cursor,
            succeeded_jobs: succeeded,
            failed_jobs: 0,
          },
          updated_at: nowIso,
        },
        { onConflict: "organization_id,sync_type" },
      );

    console.log(
      `[syncBatch] batch=${batchId} FINAL success — cursor advanced to ${batchRow.planned_cursor}`,
    );
  } else {
    // DO NOT advance last_sync_timestamp on partial batches.
    await supabase
      .from("sync_state")
      .upsert(
        {
          sync_type: batchRow.sync_type,
          organization_id: batchRow.organization_id,
          last_sync_status: "partial",
          metadata: {
            batch_id: batchId,
            succeeded_jobs: succeeded,
            failed_jobs: failed,
            cursor_held_at_previous_success: true,
          },
          updated_at: nowIso,
        },
        { onConflict: "organization_id,sync_type" },
      );
    console.log(
      `[syncBatch] batch=${batchId} FINAL partial — cursor HELD (succeeded=${succeeded} failed=${failed})`,
    );
  }

  return {
    batchId,
    remaining: 0,
    succeeded,
    failed,
    finalized: true,
    status: finalStatus,
    cursorAdvancedTo: finalStatus === "success" ? batchRow.planned_cursor : null,
  };
}
