// @ts-nocheck
/**
 * enrichReportBlocksForCache
 * ──────────────────────────
 *
 * PURE helper. No DB access. No mutation of input.
 *
 * Garanterar att varje block i report_candidate_blocks_json /
 * display_blocks_json bär tydlig, filtrerbar projekt/booking/assignment-
 * koppling så att projektvyn kan summera timmar direkt från
 * staff_day_report_cache utan att titta på time_reports / GPS / LTE.
 *
 * Lägger till på blockets root (utöver befintliga targetType/targetId/...):
 *   - booking_id          (om targetType='booking')
 *   - project_id          (om targetType='project' OCH id är ett vanligt projekt)
 *   - large_project_id    (om targetType='project'/'large_project' OCH id är ett stort projekt,
 *                          eller härlett via booking → large_project)
 *   - assignment_id       (BSA om known)
 *   - location_id         (om targetType='location'/'organization_location'/'warehouse')
 *   - target_type         (snake_case spegling av targetType)
 *   - target_id           (snake_case spegling av targetId)
 *   - target_label        (spegling av targetLabel)
 *   - staff_id, staff_name, date
 *   - start_at, end_at, duration_minutes (snake_case speglingar)
 *   - is_work_time, is_private_time, is_transport, is_review
 *   - absorbedBlockIds, warningReasons (säkerställs som arrays)
 *
 * Konsoliderade sessioner behåller huvudsessionens target-id:n.
 * Absorberade signal_gap-block skapar ALDRIG egna projektkopplingar — de
 * lever bara som ID:n i `absorbedBlockIds` på huvudblocket.
 *
 * Diagnostics: returnerar `missingProjectReferenceBlocks` med work-block
 * som saknar filtrerbar projekt/booking/large_project/location-koppling.
 */

export interface EnrichmentContext {
  staffId: string;
  staffName: string | null;
  date: string;
  /** booking.id → { project_id, large_project_id } */
  bookingMap: Map<string, { projectId: string | null; largeProjectId: string | null }>;
  /** projects.id (vanliga) — för att skilja från large_projects.id när targetType='project' */
  normalProjectIds: Set<string>;
  /** large_projects.id — för att skilja från projects.id när targetType='project' */
  largeProjectIds: Set<string>;
  /** booking.id → assignment_id (BSA) för aktuell staff+date */
  bookingAssignmentMap: Map<string, string>;
}

export interface EnrichedBlock {
  // alla befintliga fält bevaras orörda
  [key: string]: unknown;
  // tillagda root-fält:
  booking_id: string | null;
  project_id: string | null;
  large_project_id: string | null;
  assignment_id: string | null;
  location_id: string | null;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  staff_id: string;
  staff_name: string | null;
  date: string;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number;
  is_work_time: boolean;
  is_private_time: boolean;
  is_transport: boolean;
  is_review: boolean;
  absorbedBlockIds: string[];
  warningReasons: string[];
}

export interface MissingProjectReferenceEntry {
  blockId: string | null;
  label: string | null;
  startAt: string | null;
  endAt: string | null;
  knownTargetType: string | null;
  knownTargetLabel: string | null;
}

export interface EnrichmentResult {
  blocks: EnrichedBlock[];
  missingProjectReferenceBlocks: MissingProjectReferenceEntry[];
}

function asStringArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}

function isWorkBlock(b: any): boolean {
  return b?.kind === 'work';
}

function isPrivateBlock(b: any): boolean {
  return b?.targetType === 'private_residence';
}

function isTransportBlock(b: any): boolean {
  return b?.kind === 'transport';
}

function isReviewBlock(b: any): boolean {
  return b?.kind === 'needs_review' || b?.reviewState === 'needs_review';
}

export function enrichReportBlocksForCache(
  rawBlocks: any[],
  ctx: EnrichmentContext,
): EnrichmentResult {
  const out: EnrichedBlock[] = [];
  const missing: MissingProjectReferenceEntry[] = [];

  for (const b of rawBlocks ?? []) {
    const targetType: string | null = b?.targetType ?? null;
    const targetId: string | null = b?.targetId ?? null;
    const targetLabel: string | null = b?.targetLabel ?? null;

    let booking_id: string | null = null;
    let project_id: string | null = null;
    let large_project_id: string | null = null;
    let assignment_id: string | null = null;
    let location_id: string | null = null;

    if (targetType === 'booking' && targetId) {
      booking_id = targetId;
      const bk = ctx.bookingMap.get(targetId);
      if (bk) {
        project_id = bk.projectId;
        large_project_id = bk.largeProjectId;
      }
      assignment_id = ctx.bookingAssignmentMap.get(targetId) ?? null;
    } else if (targetType === 'large_project' && targetId) {
      large_project_id = targetId;
    } else if (targetType === 'project' && targetId) {
      if (ctx.largeProjectIds.has(targetId)) large_project_id = targetId;
      else if (ctx.normalProjectIds.has(targetId)) project_id = targetId;
      else project_id = targetId; // okänt — bästa gissning
    } else if (
      (targetType === 'location' ||
        targetType === 'organization_location' ||
        targetType === 'warehouse') &&
      targetId
    ) {
      location_id = targetId;
    }

    const is_work_time = isWorkBlock(b) && !isPrivateBlock(b);
    const is_private_time = isPrivateBlock(b);
    const is_transport = isTransportBlock(b);
    const is_review = isReviewBlock(b);

    const enriched: EnrichedBlock = {
      ...b,
      booking_id,
      project_id,
      large_project_id,
      assignment_id,
      location_id,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      staff_id: ctx.staffId,
      staff_name: ctx.staffName,
      date: ctx.date,
      start_at: b?.startAt ?? null,
      end_at: b?.endAt ?? null,
      duration_minutes: Number(b?.durationMinutes ?? 0),
      is_work_time,
      is_private_time,
      is_transport,
      is_review,
      absorbedBlockIds: asStringArr(b?.absorbedBlockIds),
      warningReasons: asStringArr(b?.warningReasons ?? b?.reviewReasons),
    };

    // För private_residence: säkerställ semantiken oavsett kind
    if (is_private_time) {
      enriched.is_work_time = false;
      // Visningsetikett (icke-mutating override): låt label finnas vid sidan om title
      if (!enriched.target_label) enriched.target_label = 'Jag är hemma';
    }

    // Diagnostik: work-block utan filtrerbar projektkoppling
    if (
      enriched.is_work_time &&
      !booking_id &&
      !project_id &&
      !large_project_id &&
      !location_id
    ) {
      missing.push({
        blockId: (b?.id as string) ?? null,
        label: (b?.title as string) ?? targetLabel ?? null,
        startAt: enriched.start_at,
        endAt: enriched.end_at,
        knownTargetType: targetType,
        knownTargetLabel: targetLabel,
      });
    }

    out.push(enriched);
  }

  return { blocks: out, missingProjectReferenceBlocks: missing };
}
