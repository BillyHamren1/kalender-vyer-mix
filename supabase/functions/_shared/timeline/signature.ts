// Stable hash of input data to detect cache-staleness without recomputing.
// Uses Web Crypto SHA-256 → hex.

export async function computeInputSignature(input: {
  pingCount: number;
  lastPingTs: string | null;
  reportIds: string[];
  reportUpdatedMax: string | null;
  workdayIds: string[];
  workdayUpdatedMax: string | null;
  entryIds: string[];
  entryUpdatedMax: string | null;
}): Promise<string> {
  const payload = JSON.stringify({
    pc: input.pingCount,
    lp: input.lastPingTs,
    r: [...input.reportIds].sort(),
    ru: input.reportUpdatedMax,
    w: [...input.workdayIds].sort(),
    wu: input.workdayUpdatedMax,
    e: [...input.entryIds].sort(),
    eu: input.entryUpdatedMax,
  });
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
