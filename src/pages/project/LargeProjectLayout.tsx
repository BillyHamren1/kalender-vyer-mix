import { useParams, useNavigate, Outlet, useLocation, Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LayoutDashboard, HardHat, Wallet, Plus, Search, Calendar, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { fetchAvailableBookingsForLargeProject } from "@/services/largeProjectService";
import { ProjectStatus } from "@/types/project";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const navItems = [
  { key: "overview", label: "Projektvy", icon: LayoutDashboard, path: "" },
  { key: "establishment", label: "Etableringsschema", icon: HardHat, path: "/establishment" },
  { key: "economy", label: "Projektekonomi", icon: Wallet, path: "/economy" },
];

const LargeProjectLayout = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");

  const detail = useLargeProjectDetail(id || "");
  const { project, isLoading } = detail;

  const { data: availableBookings = [] } = useQuery({
    queryKey: ["available-bookings-for-large-project"],
    queryFn: fetchAvailableBookingsForLargeProject,
    enabled: isAddBookingOpen,
  });

  const filteredAvailableBookings = availableBookings.filter(
    (b) =>
      b.client.toLowerCase().includes(bookingSearch.toLowerCase()) ||
      b.booking_number?.toLowerCase().includes(bookingSearch.toLowerCase()) ||
      b.deliveryaddress?.toLowerCase().includes(bookingSearch.toLowerCase())
  );

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "d MMMM yyyy", { locale: sv });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-6xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-4">Projektet hittades inte</h2>
        <Button onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tillbaka
        </Button>
      </div>
    );
  }

  const statusMap: Record<string, ProjectStatus> = {
    planning: "planning",
    in_progress: "in_progress",
    delivered: "delivered",
    completed: "completed",
  };

  const basePath = `/large-project/${id}`;
  const currentPath = location.pathname;
  const activeKey = currentPath.endsWith("/establishment")
    ? "establishment"
    : currentPath.endsWith("/economy")
    ? "economy"
    : "overview";

  const bookings = project.bookings || [];

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/projects")} className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(var(--heading))" }}>
                  {project.name}
                </h1>
                <Badge variant="outline" className="text-xs">Stort projekt</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {bookings.length} bokningar
                {project.location ? ` • ${project.location}` : ""}
              </p>
            </div>
          </div>
          <ProjectStatusDropdown
            status={statusMap[project.status] || "planning"}
            onStatusChange={(status) => detail.updateStatus(status as any)}
          />
        </div>

        {/* 3-page navigation */}
        <nav className="mb-6">
          <div className="bg-card rounded-2xl border border-border/40 shadow-2xl p-1.5 flex gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeKey === item.key;
              return (
                <Link
                  key={item.key}
                  to={`${basePath}${item.path}`}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  style={
                    isActive
                      ? {
                          background: "var(--gradient-icon)",
                          boxShadow: "0 4px 14px -2px hsl(184 60% 38% / 0.4), 0 2px 6px -1px hsl(184 60% 38% / 0.2)",
                        }
                      : undefined
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Booking info – show on overview page */}
        {activeKey === "overview" && (
          <div className="space-y-2 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Kopplade bokningar ({bookings.length})
              </h3>
              <Button size="sm" variant="outline" onClick={() => setIsAddBookingOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Lägg till bokning
              </Button>
            </div>
            {bookings.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Inga bokningar kopplade ännu</p>
                  <Button variant="outline" size="sm" onClick={() => setIsAddBookingOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Lägg till första bokningen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              bookings.map((lpb) =>
                lpb.booking ? (
                  <div key={lpb.id} className="relative">
                    <BookingInfoExpanded
                      booking={{
                        id: lpb.booking.id,
                        client: lpb.booking.client,
                        eventdate: lpb.booking.eventdate,
                        rigdaydate: lpb.booking.rigdaydate,
                        rigdowndate: lpb.booking.rigdowndate,
                        deliveryaddress: lpb.booking.deliveryaddress,
                        contact_name: lpb.booking.contact_name,
                        booking_number: lpb.booking.booking_number,
                      }}
                      projectLeader={project.project_leader}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-3 right-28 h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm("Ta bort bokningen från projektet?")) {
                          detail.removeBooking(lpb.booking_id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Card key={lpb.id} className="mb-2">
                    <CardContent className="p-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{lpb.display_name || "Bokning"}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          if (confirm("Ta bort bokningen från projektet?")) {
                            detail.removeBooking(lpb.booking_id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                )
              )
            )}
          </div>
        )}

        {/* Sub-page content */}
        <Outlet context={detail} />
      </div>

      {/* Add Booking Dialog */}
      <Dialog open={isAddBookingOpen} onOpenChange={setIsAddBookingOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Lägg till bokning</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök bokningar..."
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredAvailableBookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Inga tillgängliga bokningar hittades</p>
                  <p className="text-sm mt-1">Endast bekräftade bokningar som inte redan tillhör ett stort projekt visas.</p>
                </div>
              ) : (
                filteredAvailableBookings.map((booking) => (
                  <div key={booking.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{booking.client}</span>
                        {booking.booking_number && (
                          <Badge variant="outline" className="text-xs">#{booking.booking_number}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {booking.eventdate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(booking.eventdate)}
                          </span>
                        )}
                        {booking.deliveryaddress && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {booking.deliveryaddress}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => detail.addBooking(booking.id)} disabled={detail.isAddingBooking}>
                      <Plus className="w-4 h-4 mr-1" />
                      Lägg till
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddBookingOpen(false)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LargeProjectLayout;
