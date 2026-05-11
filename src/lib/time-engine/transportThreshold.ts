/**
 * Time Engine — Transport distance threshold (Engine 4).
 *
 * Central, single source of truth for the minimum measured ground distance
 * required before any GPS-derived movement may be classified as
 * `transport` / "Resa".
 *
 * Rules (engine 4):
 *   - Transport requires REAL coordinate displacement >= TRANSPORT_MIN_DISTANCE_METERS.
 *   - Reported `speed_mps` from the device is SUPPORT EVIDENCE only.
 *     It must NEVER, on its own, create a transport segment.
 *   - Movement under the threshold is treated as "same place / same work area"
 *     (stay / unknown_place) and is bridged across short signal noise.
 *   - Special: a private_residence polygon ALWAYS wins semantically over a
 *     nearby warehouse/work target. Residences and warehouses must NEVER
 *     be merged as the same work area, even when within the threshold.
 *
 * Read-only. Do not duplicate the value elsewhere — import this constant.
 */
export const TRANSPORT_MIN_DISTANCE_METERS = 500;
