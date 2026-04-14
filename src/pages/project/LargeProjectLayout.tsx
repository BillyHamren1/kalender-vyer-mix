import { useParams, useNavigate, Outlet, useLocation, Link } from "react-router-dom";
import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { updateBookingDatesViaApi } from "@/services/planningApiService";
import { toast } from "sonner";
import { ArrowLeft, LayoutDashboard, HardHat, Wallet, MessageSquare, Plus, Search, Calendar, MapPin, Trash2, ChevronDown, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import LargeProjectScheduleEditable from "@/components/project/LargeProjectScheduleEditable";
import { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { fetchAvailableBookingsForLargeProject } from "@/services/largeProjectService";
import { ProjectStatus } from "@/types/project";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";

const navItems = [
  { key: "overview", label: "Projektvy", icon: LayoutDashboard, path: "" },
  { key: "establishment", label: "Planering", icon: HardHat, path: "/establishment" },
  { key: "collaboration", label: "Samarbete", icon: MessageSquare, path: "/collaboration" },
  { key: "economy", label: "Projektekonomi", icon: Wallet, path: "/economy" },
];

const LargeProjectLayout = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [expandedBookingIds, setExpandedBookingIds] = useState<Set<string>>(new Set());
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const toggleBookingExpanded = useCallback((bookingId: string) => {
    setExpandedBookingIds(prev => {
      const next = new Set(prev);
      if (next.has(bookingId)) next.delete(bookingId); else next.add(bookingId);
      return next;
    });
  }, []);

  const detail = useLargeProjectDetail(id || "");
  const { project, isLoading } = detail;
  const bookings = project?.bookings || [];

  // Derive times from linked bookings (earliest start, latest end)
  const derivedTimes = useMemo(() => {
    const bs = bookings.map(b => b.booking).filter(Boolean);
    const earliest = (vals: (string | null | undefined)[]) => {
      const valid = vals.filter(Boolean).map(v => v!.includes('T') ? v!.substring(11, 16) : v!.substring(0, 5)).sort();
      return valid[0] || null;
    };
    const latest = (vals: (string | null | undefined)[]) => {
      const valid = vals.filter(Boolean).map(v => v!.includes('T') ? v!.substring(11, 16) : v!.substring(0, 5)).sort();
      return valid[valid.length - 1] || null;
    };
    return {
      startStart: earliest(bs.map(b => b!.rig_start_time)),
      startEnd: latest(bs.map(b => b!.rig_end_time)),
      eventStart: earliest(bs.map(b => b!.event_start_time)),
      eventEnd: latest(bs.map(b => b!.event_end_time)),
      endStart: earliest(bs.map(b => b!.rigdown_start_time)),
      endEnd: latest(bs.map(b => b!.rigdown_end_time)),
    };
  }, [bookings]);

  // Resolve project_leader UUID to name
  const rawLeader = project?.project_leader || null;
  const isLeaderUuid = rawLeader && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawLeader);
  const { data: resolvedLeaderName } = useQuery({
    queryKey: ['resolve-leader-name', rawLeader],
    queryFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('user_id', rawLeader!).maybeSingle();
      if (profile?.full_name) return profile.full_name;
      if (profile?.email) return profile.email.split('@')[0];
      const { data: staff } = await supabase.from('staff_members').select('name').eq('id', rawLeader!).maybeSingle();
      return staff?.name || rawLeader;
    },
    enabled: !!isLeaderUuid,
    staleTime: Infinity,
  });
  const projectLeaderDisplay = isLeaderUuid ? (resolvedLeaderName || null) : rawLeader;
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
    : currentPath.endsWith("/collaboration")
    ? "collaboration"
    : currentPath.endsWith("/economy")
    ? "economy"
    : "overview";

  const handleStartEditName = () => {
    setEditName(project.name);
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === project.name) {
      setIsEditingName(false);
      return;
    }
    try {
      const { error } = await supabase
        .from('large_projects')
        .update({ name: trimmed })
        .eq('id', id!);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['large-project-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      toast.success('Projektnamn uppdaterat');
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte uppdatera projektnamn');
    }
    setIsEditingName(false);
  };

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
                {isEditingName ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      ref={nameInputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      className="text-2xl font-bold h-9 px-2 w-64"
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveName}>
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditingName(false)}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <h1
                    className="text-2xl font-bold tracking-tight cursor-pointer group flex items-center gap-1.5"
                    style={{ color: "hsl(var(--heading))" }}
                    onClick={handleStartEditName}
                    title="Klicka för att ändra namn"
                  >
                    {project.name}
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h1>
                )}
                <Badge variant="outline" className="text-xs">Stort projekt</Badge>
                {project.project_number && (
                  <Badge variant="secondary" className="text-xs font-mono">{project.project_number}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {bookings.length} bokningar
                {project.address ? ` • ${project.address}` : project.location ? ` • ${project.location}` : ""}
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
          <div className="space-y-4 mb-6">
            {/* Schedule date cards */}
            <LargeProjectScheduleEditable
              startDates={project.start_date}
              eventDates={project.event_date}
              endDates={project.end_date}
              startStartTime={derivedTimes.startStart}
              startEndTime={derivedTimes.startEnd}
              eventStartTime={derivedTimes.eventStart}
              eventEndTime={derivedTimes.eventEnd}
              endStartTime={derivedTimes.endStart}
              endEndTime={derivedTimes.endEnd}
              onUpdateScheduleMulti={async (dateType, dates, startTime, endTime) => {
                // 1. Update project-level dates (array)
                const dateFieldMap = { rig: 'start_date', event: 'event_date', rigDown: 'end_date' } as const;
                await detail.updateProject({ [dateFieldMap[dateType]]: dates } as any);

                // 2. Propagate first date + times to all linked bookings
                const bookingIds = bookings.map(b => b.booking_id);
                const firstDate = dates.length > 0 ? dates[0] : null;
                if (!firstDate) {
                  queryClient.invalidateQueries({ queryKey: ['large-project', id] });
                  return;
                }
                try {
                  const fieldMap = {
                    rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
                    event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
                    rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
                  };
                  const fields = fieldMap[dateType];
                  await Promise.all(
                    bookingIds.map(bid => {
                      const updateData: Record<string, string | null> = { [fields.date]: firstDate };
                      if (startTime) updateData[fields.start] = `${firstDate}T${startTime}:00Z`;
                      if (endTime) updateData[fields.end] = `${firstDate}T${endTime}:00Z`;
                      return updateBookingDatesViaApi(bid, updateData);
                    })
                  );

                  // 3. Trigger calendar sync per booking
                  const { data: { user } } = await supabase.auth.getUser();
                  let orgId: string | undefined;
                  if (user) {
                    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
                    orgId = profile?.organization_id ?? undefined;
                  }
                  await Promise.all(
                    bookingIds.map(bid =>
                      supabase.functions.invoke('import-bookings', {
                        body: { booking_id: bid, syncMode: 'single', organization_id: orgId, localOnly: true },
                      })
                    )
                  );

                  // 4. Refresh data
                  queryClient.invalidateQueries({ queryKey: ['large-project', id] });
                  toast.success('Schema uppdaterat för alla bokningar');
                } catch (err) {
                  console.error('Error propagating schedule:', err);
                  toast.error('Kunde inte uppdatera alla bokningar');
                }
              }}
            />

            <div className="flex items-center justify-between">
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
              <Card className="border-border/50 shadow-sm overflow-hidden">
                <div className="divide-y divide-border/40">
                  {bookings.map((lpb) => {
                    const b = lpb.booking;
                    const isExpanded = expandedBookingIds.has(lpb.booking_id);
                    return (
                      <div key={lpb.id}>
                        <div
                          className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => toggleBookingExpanded(lpb.booking_id)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                            <span className="text-sm font-medium truncate">
                              {getLargeProjectBookingLabel(lpb)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {b?.deliveryaddress && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {b.deliveryaddress}
                              </span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Ta bort bokningen från projektet?")) {
                                  detail.removeBooking(lpb.booking_id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {isExpanded && b && (
                          <div className="px-3 pb-3">
                            <BookingInfoExpanded
                              booking={b}
                              projectLeader={projectLeaderDisplay}
                              onBookingUpdated={() => queryClient.invalidateQueries({ queryKey: ['large-project', id] })}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
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
