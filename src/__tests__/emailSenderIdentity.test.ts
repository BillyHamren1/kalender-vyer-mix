import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  buildSenderIdentity,
  buildReplyTo,
  parseReplyToken,
  SenderNotConfiguredError,
} from "../../supabase/functions/_shared/email/senderIdentity";

const ORG = "f5e5cade-f08b-4833-a105-56461f15b191";
const OTHER_ORG = "11111111-2222-3333-4444-555555555555";

const validRow = {
  organization_id: ORG,
  display_name: "Viking Produktion",
  mail_domain: "viking.e-flow.se",
  reply_domain: "svar.viking.e-flow.se",
  domain_verified: true,
  enabled: true,
};

describe("senderIdentity – fail closed per organisation", () => {
  it("bygger module@organisation.e-flow.se", () => {
    const id = buildSenderIdentity(ORG, "planning", validRow);
    expect(id.address).toBe("planning@viking.e-flow.se");
    expect(id.from).toBe("Viking Produktion <planning@viking.e-flow.se>");
  });

  it("kastar när organisation saknas", () => {
    expect(() => buildSenderIdentity(null, "planning", validRow)).toThrow(SenderNotConfiguredError);
  });

  it("kastar när konfiguration saknas (ingen fallback)", () => {
    expect(() => buildSenderIdentity(ORG, "planning", null)).toThrow(SenderNotConfiguredError);
  });

  it("kastar när domänen inte är verifierad", () => {
    expect(() => buildSenderIdentity(ORG, "planning", { ...validRow, domain_verified: false })).toThrow(
      SenderNotConfiguredError,
    );
  });

  it("kastar när utskick är avstängt", () => {
    expect(() => buildSenderIdentity(ORG, "planning", { ...validRow, enabled: false })).toThrow(
      SenderNotConfiguredError,
    );
  });

  it("använder aldrig en annan organisations rad", () => {
    expect(() => buildSenderIdentity(ORG, "planning", { ...validRow, organization_id: OTHER_ORG })).toThrow(
      SenderNotConfiguredError,
    );
  });
});

describe("Reply-To routing", () => {
  const id = buildSenderIdentity(ORG, "planning", validRow);

  it("bygger token-adress på organisationens svarsdomän", () => {
    const token = "0b9d94df-e46e-4987-8b7f-ef04b663dac5";
    expect(buildReplyTo(id, token)).toBe(`r-${token}@svar.viking.e-flow.se`);
  });

  it("parsar tillbaka token och domän", () => {
    const token = "0b9d94df-e46e-4987-8b7f-ef04b663dac5";
    const parsed = parseReplyToken(`Viking <r-${token}@svar.viking.e-flow.se>`);
    expect(parsed).toEqual({ token, domain: "svar.viking.e-flow.se" });
  });

  it("returnerar null för adress utan token", () => {
    expect(parseReplyToken("info@viking.e-flow.se")).toBeNull();
  });
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

describe("kontrakt: ingen hårdkodad Frans August-avsändare", () => {
  it("förbjuder fransaugust.se och 'Frans August Logistik' i edge functions", () => {
    const offenders = walk("supabase/functions")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return src.includes("fransaugust.se") || src.includes("Frans August Logistik");
      });
    expect(offenders).toEqual([]);
  });
});
