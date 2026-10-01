import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LiveBookingProductsList from "../LiveBookingProductsList";
import { fetchLiveBookingById } from "@/services/booking/liveBookingService";
import { fetchWmsPackageRows } from "@/services/booking/packageMembersService";
import { mapCanonicalBookingToPlanning } from "@/lib/booking/canonicalBooking";

vi.mock("@/services/booking/liveBookingService", () => ({ fetchLiveBookingById: vi.fn() }));
vi.mock("@/services/booking/packageMembersService", () => ({ fetchWmsPackageRows: vi.fn() }));

const PKG = "26d9693f";
const booking = mapCanonicalBookingToPlanning({
  id: "b1",
  booking_number: "2609-39",
  clientName: "Tavet AB",
  status: "Confirmed",
  products: [
    { booking_product_id: "tent", product_name: "UNIFLEX 10x20 /380 (svart)", quantity: 1, inventory_package_id: PKG },
    { booking_product_id: "gable", product_name: "  ↳ U10 Gaveltriangel", quantity: 2, parent_product_id: "tent", parent_package_id: PKG, inventory_package_id: PKG, is_package_component: true },
    { booking_product_id: "glass", product_name: "  ↳ Uniflex - Glasvägg Svart /380", quantity: 64, parent_product_id: "tent", parent_package_id: PKG, inventory_package_id: PKG, is_package_component: true },
    { booking_product_id: "transport", product_name: "Transport - hämtas hos oss", quantity: 1 },
  ],
} as never);

// Lagrets projektion, inkl. gammal fristående glasvägg (36) som aldrig får visas.
const wmsRows = [
  { id: "w-glass", name: "Uniflex - Glasvägg Svart /380", quantity: 36, sync_key: "wms:g", sort_index: 0, inventory_package_id: null, parent_product_id: null, is_package_component: false },
  { id: "w-pkg", name: "UNIFLEX 10x20 /380 (svart)", quantity: 212, sync_key: "wms:p", sort_index: 4, inventory_package_id: PKG, parent_product_id: null, is_package_component: false },
  { id: "w-c1", name: "U sprinter bult Lång", quantity: 16, sync_key: "wms:p::c1", sort_index: 5, inventory_package_id: PKG, parent_product_id: "w-pkg", is_package_component: true },
  { id: "w-c2", name: "U Banan 5m Svart", quantity: 12, sync_key: "wms:p::c2", sort_index: 6, inventory_package_id: PKG, parent_product_id: "w-pkg", is_package_component: true },
];

const renderList = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LiveBookingProductsList bookingId="b1" />
    </QueryClientProvider>,
  );

const pos = (a: Node, b: Node) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;

describe("LiveBookingProductsList — paketinnehåll dolt, tillbehör synliga", () => {
  beforeEach(() => vi.clearAllMocks());

  it("visar tillbehören direkt utan klick medan paketinnehållet är dolt", async () => {
    vi.mocked(fetchLiveBookingById).mockResolvedValue(booking);
    vi.mocked(fetchWmsPackageRows).mockResolvedValue(wmsRows as never);
    renderList();

    // Tillbehören syns direkt — inget klick krävs.
    const accessories = await screen.findByTestId("package-accessories");
    expect(within(accessories).getByText("U10 Gaveltriangel")).toBeInTheDocument();
    expect(within(accessories).getByText("Uniflex - Glasvägg Svart /380")).toBeInTheDocument();
    expect(screen.getByText("Antal: 64")).toBeInTheDocument();

    // Paketinnehållet är stängt från början.
    expect(screen.queryByTestId("package-members")).not.toBeInTheDocument();
    const toggle = screen.getByTestId("package-members-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(toggle).getByText("Paketinnehåll")).toBeInTheDocument();
    expect(within(toggle).getByText("(2)")).toBeInTheDocument();

    // Gamla WMS-kopior visas aldrig.
    expect(screen.queryByText("Antal: 36")).not.toBeInTheDocument();
    expect(screen.queryByText("Antal: 212")).not.toBeInTheDocument();
    expect(screen.getAllByText("UNIFLEX 10x20 /380 (svart)")).toHaveLength(1);
  });

  it("paketinnehållet öppnas vid klick och ligger före tillbehören", async () => {
    vi.mocked(fetchLiveBookingById).mockResolvedValue(booking);
    vi.mocked(fetchWmsPackageRows).mockResolvedValue(wmsRows as never);
    renderList();

    const toggle = await screen.findByTestId("package-members-toggle");
    fireEvent.click(toggle);

    const members = await screen.findByTestId("package-members");
    expect(within(members).getByText("U sprinter bult Lång")).toBeInTheDocument();
    expect(within(members).getByText("U Banan 5m Svart")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const accessories = screen.getByTestId("package-accessories");
    const tent = screen.getByText("UNIFLEX 10x20 /380 (svart)");
    // Ordning: tält → paketinnehåll → tillbehör → transport
    expect(pos(tent, members)).toBeTruthy();
    expect(pos(members, accessories)).toBeTruthy();
    expect(pos(accessories, screen.getByText("Transport - hämtas hos oss"))).toBeTruthy();

    // Paketdelarna ligger djupare än tillbehören.
    expect(within(members).getByText("U sprinter bult Lång").closest(".pl-8")).not.toBeNull();
    const accessoryText = within(accessories).getByText("U10 Gaveltriangel");
    expect(accessoryText.closest(".pl-4")).not.toBeNull();
    expect(accessoryText.closest(".pl-8")).toBeNull();
  });

  it("visar Bookings orderrader även om paketinnehållet inte kan läsas", async () => {
    vi.mocked(fetchLiveBookingById).mockResolvedValue(booking);
    vi.mocked(fetchWmsPackageRows).mockRejectedValue(new Error("nope"));
    renderList();

    expect(await screen.findByText("Paketinnehållet kunde inte läsas just nu.")).toBeInTheDocument();
    expect(screen.getByText("Antal: 64")).toBeInTheDocument();
    expect(screen.queryByTestId("package-members")).not.toBeInTheDocument();
    expect(screen.queryByTestId("package-members-toggle")).not.toBeInTheDocument();
  });
});
