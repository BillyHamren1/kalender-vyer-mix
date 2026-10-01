import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LiveBookingProductsList from "../LiveBookingProductsList";
import { fetchLiveBookingById } from "@/services/booking/liveBookingService";

vi.mock("@/services/booking/liveBookingService", () => ({
  fetchLiveBookingById: vi.fn(),
}));

const products = [
  { id: "parent", name: "UNIFLEX 10x20 /380 (svart)", quantity: 1 },
  { id: "gable", name: "↳ U10 Gaveltriangel, transparent (svart ram)", quantity: 2, parentProductId: "parent", isPackageComponent: true },
  { id: "roof", name: "↳ U10 Takduk Transparent", quantity: 4, parentProductId: "parent", isPackageComponent: true },
  { id: "glass", name: "↳ Uniflex - Glasvägg Svart /380", quantity: 64, parentProductId: "parent", isPackageComponent: true },
  { id: "door", name: "↳ Uniflex - Dörr Svart", quantity: 4, parentProductId: "parent", isPackageComponent: true },
  { id: "transport", name: "Transport - hämtas hos oss", quantity: 1 },
];

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
    vi.mocked(fetchLiveBookingById).mockResolvedValue({ products } as never);
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