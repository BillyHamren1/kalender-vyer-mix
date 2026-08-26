import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("large project overview", () => {
  it("shows only the linked booking workspace", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/pages/project/LargeProjectViewPage.tsx"),
      "utf8",
    );
    const layout = fs.readFileSync(
      path.resolve(process.cwd(), "src/pages/project/LargeProjectLayout.tsx"),
      "utf8",
    );

    expect(page).not.toContain("ProjectOverviewHeader");
    expect(page).not.toContain("ProjectTaskList");
    expect(page).not.toContain("Projektinfo");
    expect(layout).toContain('>Bokningar</h2>');
    expect(layout).toContain("BookingInfoExpanded");
    expect(layout).not.toContain("Excelvy");
    expect(layout).not.toContain("Redigera adress");
  });
});