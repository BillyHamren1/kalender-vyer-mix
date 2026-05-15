import { useParams, useNavigate, Outlet, useLocation, Link } from "react-router-dom";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { arrayToPeriod } from "@/services/largeProjectScheduleSync";
import { writeProjectDates } from "@/services/projectDateAuthority";
import { toast } from "sonner";
import { ArrowLeft, LayoutDashboard, HardHat, Wallet, MessageSquare, Plus, Search, Calendar, MapPin, Trash2, ChevronDown, ChevronRight, Pencil, Check, X, AlertTriangle, FolderKanban, ClipboardList, Package, Combine, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import LargeProjectScheduleEditable from "@/components/project/LargeProjectScheduleEditable";
import { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { useBookingPhaseDays } from "@/hooks/useBookingPhaseDays";
import { fetchAvailableBookingsForLargeProject } from "@/services/largeProjectService";
import { ProjectStatus } from "@/types/project";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";
import ProjectAddressMapDialog from "@/components/maps/ProjectAddressMapDialog";
import LargeProjectProductsOverview from "@/components/project/LargeProjectProductsOverview";
import LargeProjectExcelView from "@/components/project/LargeProjectExcelView";
import ConsolidateProjectsDialog from "@/components/project/ConsolidateProjectsDialog";

const navItems = [
  { key: "overview", label: "Projektvy", icon: LayoutDashboard, path: "" },
  { key: "establishment", label: "Planering", icon: HardHat, path: "/establishment" },
  { key: "economy", label: "Projektöversikt", icon: Wallet, path: "/economy" },
];

const LargeProjectLayout = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isAddBookingOpen, setIsAddBookingOpen] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [expandedBookingIds, setExpandedBookingIds] = useState<Set<string>>(new Set());
  const [bookingListSearch, setBookingListSearch] = useState("");
  const [isConsolidateOpen, setIsConsolidateOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [editSubtitle, setEditSubtitle] = useState("");
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [linkedView, setLinkedView] = useState<'excel' | 'bookings' | 'products'>('bookings');
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

  // Sibling booking ids — used to read the canonical phase days from
  // calendar_events (same source the personalkalender renders from).
  const siblingBookingIds = useMemo(
    () => bookings.map(b => b.booking?.id).filter(Boolean) as string[],
    [bookings],
  );
  const { days: phaseDays } = useBookingPhaseDays(siblingBookingIds);

  // Times still come from booking columns (rig_start_time etc) — those are
  // the booking-level "Fast tid" defaults. Date arrays come from
  // calendar_events so the project header matches the personnel calendar
  // 1:1 and ignores stale single-field values like a March eventdate on a
  // May booking.
  const derivedTimes = useMemo(() => {
    const bs = bookings.map(b => b.booking).filter(Boolean) as any[];
    const earliest = (vals: (string | null | undefined)[]) => {
      const valid = vals.filter(Boolean).map(v => v!.includes('T') ? v!.substring(11, 16) : v!.substring(0, 5)).sort();
      return valid[0] || null;
    };
    const latest = (vals: (string | null | undefined)[]) => {
      const valid = vals.filter(Boolean).map(v => v!.includes('T') ? v!.substring(11, 16) : v!.substring(0, 5)).sort();
      return valid[valid.length - 1] || null;
    };
    const uniqueSortedDates = (rows: { date: string }[]) =>
      Array.from(new Set(rows.map(r => r.date).filter(Boolean))).sort();
    return {
      startStart: earliest(bs.map(b => b!.rig_start_time)),
      startEnd: latest(bs.map(b => b!.rig_end_time)),
      eventStart: earliest(bs.map(b => b!.event_start_time)),
      eventEnd: latest(bs.map(b => b!.event_end_time)),
      endStart: earliest(bs.map(b => b!.rigdown_start_time)),
      endEnd: latest(bs.map(b => b!.rigdown_end_time)),
      rigDates: uniqueSortedDates(phaseDays.rig),
      eventDates: uniqueSortedDates(phaseDays.event),
      rigDownDates: uniqueSortedDates(phaseDays.rigDown),
    };
  }, [bookings, phaseDays]);


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

  // Auto-inherit address from first booking if project has none
  useEffect(() => {
    if (!project || project.address || project.address_latitude) return;
    const firstBooking = bookings.find(b => b.booking?.deliveryaddress);
    if (!firstBooking?.booking) return;
    const b = firstBooking.booking;
    if (b.delivery_city || b.deliveryaddress) {
      supabase.from('bookings')
        .select('delivery_latitude, delivery_longitude, delivery_city, delivery_postal_code')
        .eq('id', firstBooking.booking_id)
        .single()
        .then(({ data }) => {
          if (data) {
            detail.updateProject({
              address: b.deliveryaddress || null,
              address_city: data.delivery_city || b.delivery_city || null,
              address_postal_code: data.delivery_postal_code || b.delivery_postal_code || null,
              address_latitude: data.delivery_latitude || null,
              address_longitude: data.delivery_longitude || null,
            } as any);
          }
        });
    }
  }, [project?.id, project?.address, bookings.length]);

  const handleAddressDialogSave = async (data: {
    address: string;
    latitude: number | null;
    longitude: number | null;
    radius_meters: number;
    geofence_mode: 'circle' | 'polygon';
    geofence_polygon: GeoJSON.Polygon | null;
  }) => {
    // Await så vi (1) vet om DB-skrivningen lyckades och (2) hinner
    // invalidera react-query INNAN dialogen stängs. Tidigare fire-and-forget
    // kunde svälja t.ex. valideringsfel på address_geofence_polygon utan
    // att användaren såg det → polygonen verkade sparad men var det inte.
    await detail.updateProject({
      address: data.address || null,
      address_latitude: data.latitude,
      address_longitude: data.longitude,
      address_radius_meters: data.radius_meters,
      address_geofence_mode: data.geofence_mode,
      address_geofence_polygon: data.geofence_polygon as any,
    } as any);
    toast.success('Adress och staket sparade');
  };

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
      <div className="theme-purple h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
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

  const handleStartEditSubtitle = () => {
    setEditSubtitle((project as any)?.description || "");
    setIsEditingSubtitle(true);
    setTimeout(() => subtitleInputRef.current?.focus(), 50);
  };

  const handleSaveSubtitle = async () => {
    const trimmed = editSubtitle.trim();
    const current = ((project as any)?.description || "").trim();
    if (trimmed === current) {
      setIsEditingSubtitle(false);
      return;
    }
    try {
      const { error } = await supabase
        .from('large_projects')
        .update({ description: trimmed || null })
        .eq('id', id!);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['large-project-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte uppdatera rubrik');
    }
    setIsEditingSubtitle(false);
  };

  const handleScheduleUpdate = async (
    dateType: 'rig' | 'event' | 'rigDown',
    dates: string[],
    startTime: string,
    endTime: string,
  ) => {
    const dateFieldMap = { rig: 'start_date', event: 'event_date', rigDown: 'end_date' } as const;
    const bookingIds = bookings.map(b => b.booking_id);

    // 1. Skriv lokalt till large_projects FÖRST — det är source of truth för LP-datum.
    //    import-bookings-reconcileraren läser sedan dessa när calendar_events regenereras.
    try {
      await detail.updateProject({ [dateFieldMap[dateType]]: dates } as any);
    } catch (err) {
      console.error('Local large_projects update failed:', err);
      queryClient.invalidateQueries({ queryKey: ['large-project', id] });
      toast.error('Kunde inte spara datumen — laddar om');
      return;
    }

    // 2. Pusha till externa systemet + rebuilda calendar_events via central authority.
    if (bookingIds.length > 0) {
      try {
        const res = await writeProjectDates({
          projectId: id!,
          projectType: 'large',
          dates: { [dateType]: dates },
        });
        if (!res.ok) throw new Error(res.error || 'apply-project-dates failed');
      } catch (err: any) {
        console.error('Error propagating project dates:', err);
        queryClient.invalidateQueries({ queryKey: ['large-project', id] });
        queryClient.invalidateQueries({ queryKey: ['large-project-gantt', id] });
        const msg = err?.message || 'Okänt fel';
        toast.error(`Datumen sparades lokalt men kunde inte spridas: ${msg}`);
        return;
      }
    }

    // 3. Spegla till Gantt-perioden.
    try {
      const ganttKeyMap = { rig: 'establishment', event: 'event', rigDown: 'deestablishment' } as const;
      const ganttKey = ganttKeyMap[dateType];
      const { start, end } = arrayToPeriod(dates);
      if (start && end) {
        await supabase
          .from('large_project_gantt_steps')
          .update({ start_date: start, end_date: end })
          .eq('large_project_id', id!)
          .eq('step_key', ganttKey);
        queryClient.invalidateQueries({ queryKey: ['large-project-gantt', id] });
      }
    } catch (err) {
      console.warn('Could not sync Gantt period from schedule cards:', err);
    }

    queryClient.invalidateQueries({ queryKey: ['large-project', id] });
    if (dates.length === 0 || bookingIds.length === 0) return;
    toast.success('Schema uppdaterat');
  };

  return (
    <div className="theme-purple h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="px-5 py-3.5 rounded-xl bg-card border border-border/40 shadow-sm mb-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/projects"))}
                className="rounded-lg h-8 w-8 -ml-1"
                aria-label="Tillbaka"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shadow-[hsl(270_45%_55%)]/15 shrink-0"
                style={{ background: 'linear-gradient(135deg, hsl(270 45% 60%) 0%, hsl(280 50% 45%) 100%)' }}
              >
                <FolderKanban className="text-white" style={{ width: 18, height: 18 }} />
              </div>
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
                        className="text-xl font-bold h-8 px-2 w-64"
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
                      className="text-xl font-bold tracking-tight leading-none cursor-pointer group flex items-center gap-1.5"
                      style={{ color: "hsl(var(--heading))" }}
                      onClick={handleStartEditName}
                      title="Klicka för att ändra namn"
                    >
                      {project.name}
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h1>
                  )}
                  <Badge variant="outline" className="text-xs">Stort projekt</Badge>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 leading-none">
                  {project.project_number && (
                    <span>#{project.project_number}</span>
                  )}
                  {project.project_number && <span>·</span>}
                  {isEditingSubtitle ? (
                    <Input
                      ref={subtitleInputRef}
                      value={editSubtitle}
                      onChange={(e) => setEditSubtitle(e.target.value)}
                      onBlur={handleSaveSubtitle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSubtitle();
                        if (e.key === 'Escape') setIsEditingSubtitle(false);
                      }}
                      placeholder="Lägg till rubrik..."
                      className="h-6 px-1.5 py-0 text-xs w-64 border-0 shadow-none focus-visible:ring-1 bg-transparent"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartEditSubtitle}
                      className={cn(
                        "hover:text-foreground transition-colors text-left truncate max-w-[400px]",
                        !(project as any).description && "italic text-muted-foreground/70"
                      )}
                      title="Klicka för att ändra rubrik"
                    >
                      {(project as any).description || "Lägg till rubrik..."}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConsolidateOpen(true)}
                className="gap-1.5"
              >
                <Combine className="h-4 w-4" />
                Konsolidera
              </Button>
              <ProjectStatusDropdown
                status={statusMap[project.status] || "planning"}
                onStatusChange={(status) => detail.updateStatus(status as any)}
              />
            </div>
            <ConsolidateProjectsDialog
              open={isConsolidateOpen}
              onOpenChange={setIsConsolidateOpen}
              initialSelection={id ? { type: 'large', id } : null}
              initialName={project?.name}
            />
          </div>

          {/* Datumkort flyttade in i headern */}
          <div className="mt-4 pt-4 border-t border-border/40">
            <LargeProjectScheduleEditable
              startDates={derivedTimes.rigDates}
              eventDates={derivedTimes.eventDates}
              endDates={derivedTimes.rigDownDates}
              startStartTime={derivedTimes.startStart}
              startEndTime={derivedTimes.startEnd}
              eventStartTime={derivedTimes.eventStart}
              eventEndTime={derivedTimes.eventEnd}
              endStartTime={derivedTimes.endStart}
              endEndTime={derivedTimes.endEnd}
              onUpdateScheduleMulti={handleScheduleUpdate}
            />
          </div>
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
                          boxShadow: "0 4px 14px -2px hsl(var(--primary) / 0.4), 0 2px 6px -1px hsl(var(--primary) / 0.2)",
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
            {/* Schema-datumkort har flyttats till headern ovan */}

            {/* Address card */}
            <Card className="border-border/50 shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddressDialogOpen(true)}
                    className="flex items-center gap-2 text-sm hover:text-foreground transition-colors group min-w-0"
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className={cn(
                      'truncate',
                      project.address ? 'text-foreground' : 'text-muted-foreground italic'
                    )}>
                      {project.address || 'Ingen adress – klicka för att lägga till'}
                    </span>
                    <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {project.address_latitude && project.address_longitude && (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        📍 {project.address_latitude.toFixed(4)}, {project.address_longitude.toFixed(4)}
                      </Badge>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setIsAddressDialogOpen(true)} className="h-7">
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Redigera adress
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ProjectAddressMapDialog
              open={isAddressDialogOpen}
              onOpenChange={setIsAddressDialogOpen}
              initial={{
                address: project.address ?? "",
                latitude: project.address_latitude ?? null,
                longitude: project.address_longitude ?? null,
                radius_meters: (project as any).address_radius_meters ?? 100,
                geofence_mode: ((project as any).address_geofence_mode as any) ?? "circle",
                geofence_polygon: ((project as any).address_geofence_polygon as any) ?? null,
              }}
              onSave={handleAddressDialogSave}
            />

            <div className="relative flex items-center justify-center">
              <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                <Button
                  variant={linkedView === 'excel' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 w-36 px-4 text-sm gap-2"
                  onClick={() => setLinkedView('excel')}
                >
                  <Table2 className="h-4 w-4" />
                  Excelvy
                </Button>
                <Button
                  variant={linkedView === 'bookings' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 w-36 px-4 text-sm gap-2"
                  onClick={() => setLinkedView('bookings')}
                >
                  <ClipboardList className="h-4 w-4" />
                  Bokningar ({bookings.length})
                </Button>
                <Button
                  variant={linkedView === 'products' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-9 w-36 px-4 text-sm gap-2"
                  onClick={() => setLinkedView('products')}
                >
                  <Package className="h-4 w-4" />
                  Produkter
                </Button>
              </div>
              {linkedView === 'bookings' && (
                <div className="absolute right-0 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsAddBookingOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Lägg till bokning
                  </Button>
                </div>
              )}
            </div>
            {linkedView === 'excel' && (
              <LargeProjectExcelView bookings={bookings as any} />
            )}
            {linkedView === 'products' && (
              <LargeProjectProductsOverview bookings={bookings} largeProjectId={id || ""} />
            )}
            {linkedView === 'bookings' && (
              bookings.length === 0 ? (
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
                    {bookings.map((lpb: any) => {
                      const b = lpb.booking;
                      const isExpanded = expandedBookingIds.has(lpb.booking_id);
                      const isCancelled = (b?.status || '').toUpperCase() === 'CANCELLED';
                      return (
                        <div key={lpb.id}>
                          <div
                            className={cn(
                              "flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer",
                              isCancelled && "bg-destructive/5"
                            )}
                            onClick={() => toggleBookingExpanded(lpb.booking_id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                              {isCancelled && (
                                <Badge className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive ring-1 ring-destructive/30 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  AVBOKAD
                                </Badge>
                              )}
                              <span className={cn("text-sm font-medium truncate", isCancelled && "line-through text-muted-foreground")}>
                                {getLargeProjectBookingLabel(lpb)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {b?.deliveryaddress && (
                                <span className={cn("text-xs text-muted-foreground flex items-center gap-1", isCancelled && "line-through text-muted-foreground/70")}>
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
                        <span className="font-medium">{(booking as any).title || booking.client}</span>
                        {(booking as any).title && (
                          <span className="text-xs text-muted-foreground">{booking.client}</span>
                        )}
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
