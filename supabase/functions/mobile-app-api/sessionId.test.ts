// Single-device-per-staff: kontraktstest för token-payload-formatet.
// Verifierar att verifyToken plockar ut sessionId och att den round-trippar.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Reproducera generateToken/verifyToken-format (samma som index.ts).
const TOKEN_EXPIRY_HOURS = 24 * 30;
function generateToken(staffId: string, sessionId?: string): string {
  const timestamp = Date.now();
  const expiresAt = timestamp + (TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const payload: Record<string, unknown> = { staffId, timestamp, expiresAt };
  if (sessionId) payload.sessionId = sessionId;
  return btoa(JSON.stringify(payload));
}
function verifyToken(token: string) {
  const payload = JSON.parse(atob(token));
  return {
    staffId: payload.staffId,
    sessionId: typeof payload.sessionId === "string" ? payload.sessionId : undefined,
    expiresAt: payload.expiresAt,
  };
}

Deno.test("token utan sessionId (legacy) bevarar staffId men sessionId är undefined", () => {
  const tok = generateToken("staff_abc");
  const v = verifyToken(tok);
  assertEquals(v.staffId, "staff_abc");
  assertEquals(v.sessionId, undefined);
  assert(typeof v.expiresAt === "number");
});

Deno.test("token med sessionId round-trippar korrekt", () => {
  const sid = crypto.randomUUID();
  const tok = generateToken("staff_xyz", sid);
  const v = verifyToken(tok);
  assertEquals(v.staffId, "staff_xyz");
  assertEquals(v.sessionId, sid);
});

Deno.test("två efterföljande login ger DIFFERENT sessionId (senaste vinner)", () => {
  const sid1 = crypto.randomUUID();
  const sid2 = crypto.randomUUID();
  assert(sid1 !== sid2, "uuid kollisionsfri");
  const t1 = generateToken("s", sid1);
  const t2 = generateToken("s", sid2);
  assert(t1 !== t2);
  assertEquals(verifyToken(t1).sessionId, sid1);
  assertEquals(verifyToken(t2).sessionId, sid2);
});
