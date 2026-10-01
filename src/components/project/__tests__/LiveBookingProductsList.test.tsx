import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LiveBookingProductsList from "../LiveBookingProductsList";
import { fetchLiveBookingById } from "@/services/booking/liveBookingService";
import { mapCanonicalBookingToPlanning } from "@/lib/booking/canonicalBooking";

vi.mock("@/services/booking/liveBookingService", () => ({
  fetchLiveBookingById: vi.fn(),
}));

const bookingFromActualExportShape = mapCanonicalBookingToPlanning({
  id: "booking-1",
  booking_number: "2609-39",
  clientName: "Tavet AB",
  status: "Confirmed",
  products: [
    { booking_product_id: "parent", product_name: "UNIFLEX 10x20 /380 (svart)", quantity: 1, inventory_package_id: "package-definition" },
    { booking_product_id: "gable", product_name: "  ↳ U10 Gaveltriangel, transparent (svart ram)", quantity: 2, parent_product_id: "parent", inventory_package_id: "package-definition", is_package_component: true },
    { booking_product_id: "roof", product_name: "  ↳ U10 Takduk Transparent", quantity: 4, parent_product_id: "parent", inventory_package_id: "package-definition", is_package_component: true },
    { booking_product_id: "glass", product_name: "  ↳ Uniflex - Glasvägg Svart /380", quantity: 64, parent_product_id: "parent", inventory_package_id: "package-definition", is_package_component: true },
    { booking_product_id: "door", product_name: "  ↳ Uniflex - Dörr Svart", quantity: 4, parent_product_id: "parent", inventory_package_id: "package-definition", is_package_component: true },
    { booking_product_id: "transport", product_name: "Transport - hämtas hos oss", quantity: 1 },
  ],
});

const renderList = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LiveBookingProductsList bookingId="booking-1" />
    </QueryClientProvider>,
  );
};

describe("LiveBookingProductsList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("visar Bookings aktuella antal och ordning utan WMS-dubletter", async () => {
    vi.mocked(fetchLiveBookingById).mockResolvedValue(bookingFromActualExportShape);
    renderList();

    const parent = await screen.findByText("UNIFLEX 10x20 /380 (svart)");
    fireEvent.click(parent.closest("button") as HTMLButtonElement);

    expect(await screen.findByText("Uniflex - Glasvägg Svart /380")).toBeInTheDocument();
    expect(screen.getByText("Antal: 64")).toBeInTheDocument();
    expect(screen.queryByText("Antal: 36")).not.toBeInTheDocument();
    expect(screen.getAllByText("Transport - hämtas hos oss")).toHaveLength(1);

    const labels = Array.from(document.querySelectorAll("span"))
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    expect(labels.indexOf("U10 Gaveltriangel, transparent (svart ram)"))
      .toBeLessThan(labels.indexOf("U10 Takduk Transparent"));
    expect(labels.indexOf("U10 Takduk Transparent"))
      .toBeLessThan(labels.indexOf("Uniflex - Glasvägg Svart /380"));
    expect(labels.indexOf("Uniflex - Glasvägg Svart /380"))
      .toBeLessThan(labels.indexOf("Uniflex - Dörr Svart"));
    expect(labels.indexOf("Uniflex - Dörr Svart"))
      .toBeLessThan(labels.indexOf("Transport - hämtas hos oss"));
  });

  it("visar ett tydligt fel och ingen lokal reservlista när Booking inte svarar", async () => {
    vi.mocked(fetchLiveBookingById).mockRejectedValue(new Error("upstream unavailable"));
    renderList();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
      "Kunde inte läsa aktuella orderrader från Booking. Ingen äldre kopia visas.",
    ));
    expect(screen.queryByText("Antal: 36")).not.toBeInTheDocument();
  });
});