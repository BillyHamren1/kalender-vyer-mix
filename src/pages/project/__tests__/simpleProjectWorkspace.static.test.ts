import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("simple project workspace", () => {
  it("keeps the legacy project and execution routes available", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/project-next/:projectId"');
    expect(app).toContain('path="/project/:projectId"');
    expect(app).toContain('<Route path="execution" element={<EstablishmentPage />} />');
  });

  it("keeps simple todos out of the execution bridge", () => {
    const page = read("src/pages/project/SimpleProjectWorkspacePage.tsx");
    expect(page).toContain("createProjectTask");
    expect(page).toContain("updateProjectTask");
    expect(page).not.toContain("bridgeProjectTaskToExecution");
    expect(page).not.toContain("ensureBridgeAndSync");
  });

  it("uses the existing organization-scoped supplier mail contract", () => {
    const page = read("src/pages/project/SimpleProjectWorkspacePage.tsx");
    const sender = read("supabase/functions/_shared/email/senderIdentity.ts");
    expect(page).toContain("useSupplierRequests");
    expect(sender).toContain("organization_email_senders");
    expect(sender).toContain("domain_verified");
    expect(sender).not.toContain("f5e5cade-f08b-4833-a105-56461f15b191");
  });

  it("writes notes to the booking when a booking exists", () => {
    const service = read("src/services/simpleProjectWorkspaceService.ts");
    expect(service).toContain('supabase.from("bookings").update({ internalnotes: notes })');
    expect(service).toContain('supabase.from("projects").update({ internalnotes: notes })');
  });
});
