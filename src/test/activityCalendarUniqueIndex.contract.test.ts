import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("activity calendar uniqueness", () => {
  it("reserves booking/date uniqueness for phase events, not activities", () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const definitions = readdirSync(migrationsDir)
      .sort()
      .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
      .filter((sql) => sql.includes("CREATE UNIQUE INDEX calendar_events_booking_phase_date_uniq"));

    const currentDefinition = definitions.at(-1) ?? "";

    expect(currentDefinition).toContain("event_type IN ('rig', 'event', 'rigDown')");
    expect(currentDefinition).not.toContain("event_type IN ('rig', 'event', 'rigDown', 'activity')");
  });
});