import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("simple project workspace", () => {
  it("redirects every legacy project entry to the simple view while keeping execution available", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/project-next/:projectId"');
    expect(app).toContain('path="/project/:projectId"');
    expect(app).toContain('<Route index element={<LegacyProjectRedirect />} />');
    expect(app).toContain('`/project-next/${projectId}`');
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

  it("restores the complete operational booking information from the legacy project view", () => {
    const page = read("src/pages/project/SimpleProjectWorkspacePage.tsx");
    expect(page).toContain("BookingInfoExpanded");
    expect(page).toContain("ProjectFiles");
    expect(page).toContain("fetchBookingAttachments");
    expect(page).toContain("showProductsHeading");
    expect(page).toContain("rigdaydate: project.rigdaydate");
    expect(page).toContain("rigdowndate: project.rigdowndate");
    expect(page).toContain("contact_phone: project.contact_phone");
  });

  it("uses the purple project header and separates booking information from planning", () => {
    const page = read("src/pages/project/SimpleProjectWorkspacePage.tsx");
    expect(page).toContain("bg-primary p-5 text-primary-foreground");
    expect(page).toContain('value="booking"');
    expect(page).toContain('value="planning"');
    expect(page).toContain("Bokningsinformation");
    expect(page).toContain("Projektplanering");
    expect(page).toContain("ProjectTransportWidget");
    expect(page).toContain("isTransportTodoTitle");
  });
});
