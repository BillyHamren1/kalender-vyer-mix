import { useRef, useState, useEffect } from "react";
import { useParams, useNavigate, Outlet, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, LayoutDashboard, HardHat, Wallet, MapPin, Pencil, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import ProjectActionMenu from "@/components/project/ProjectActionMenu";
import { AddToLargeProjectDialog } from "@/components/project/AddToLargeProjectDialog";
import ConsolidateProjectsDialog from "@/components/project/ConsolidateProjectsDialog";
import ProjectAddressMapDialog from "@/components/maps/ProjectAddressMapDialog";
import LargeProjectScheduleEditable from "@/components/project/LargeProjectScheduleEditable";
import { useProjectDetail } from "@/hooks/useProjectDetail";
import { cancelProject } from "@/services/projectService";
import { convertToMedium, prepareConvertToLarge, type ProjectType } from "@/services/projectConversionService";
import { writeProjectDates } from "@/services/projectDateAuthority";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const navItems = [
  { key: "overview", label: "Projektvy", icon: LayoutDashboard, path: "" },
  { key: "execution", label: "Utförande", icon: HardHat, path: "/execution", emphasis: true },
  { key: "economy", label: "Projektöversikt", icon: Wallet, path: "/economy" },
];

const ProjectLayout = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [largeProjectBookingId, setLargeProjectBookingId] = useState<string | null>(null);
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [isConsolidateOpen, setIsConsolidateOpen] = useState(false);
  const [isEditingSubtitle, setIsEditingSubtitle] = useState(false);
  const [editSubtitle, setEditSubtitle] = useState("");
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  const detail = useProjectDetail(projectId || "");
  const { project, isLoading } = detail;

  const handleConvert = async (targetType: ProjectType) => {
    if (!project?.booking_id) {
      toast.error('Projektet har ingen kopplad bokning');
      return;
    }
    if (!confirm(`Ändra till stort projekt? Det befintliga projektet raderas och ett nytt skapas.`)) return;

    const current = { type: 'medium' as const, id: projectId! };
    try {
      if (targetType === 'medium') return;
      if (targetType === 'large') {
        await prepareConvertToLarge(current, project.booking_id);
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
        setLargeProjectBookingId(project.booking_id);
      }
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte konvertera');
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm(`Avboka och dölj medelprojekt: "${project?.name}"?\n\nProjektet behålls med status "Avbokad" och försvinner från aktiva listor. Bokningen återintroduceras inte i inboxen.`)) return;
    try {
      await cancelProject(projectId!);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      toast.success('Medelprojekt avbokat och dolt');
      navigate('/projects');
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte avboka projekt');
    }
  };

  const handleAddressDialogSave = async (data: {
    address: string;
    latitude: number | null;
    longitude: number | null;
    radius_meters: number;
    geofence_mode: 'circle' | 'polygon';
    geofence_polygon: GeoJSON.Polygon | null;
  }) => {
    try {
      await detail.updateProject({
        deliveryaddress: data.address || null,
        delivery_latitude: data.latitude,
        delivery_longitude: data.longitude,
        address_radius_meters: data.radius_meters,
        address_geofence_mode: data.geofence_mode,
        address_geofence_polygon: data.geofence_polygon as any,
      } as any);
      toast.success('Adress och staket sparade');
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte spara adress');
      throw e;
    }
  };

  // Fallback-uppslag: id:t kan vara ett stort projekt eller en bokning som migrerats.
  // VIKTIGT: dessa hooks MÅSTE ligga före alla early returns (Rules of Hooks).
  const lpFallback = useQuery({
    queryKey: ['project-fallback-large', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const lp = await supabase.from('large_projects').select('id').eq('id', projectId).maybeSingle();
      if (lp.data?.id) return { type: 'large' as const, id: lp.data.id };
      const b = await supabase.from('bookings').select('large_project_id, assigned_project_id').eq('id', projectId).maybeSingle();
      if (b.data?.large_project_id) return { type: 'large' as const, id: b.data.large_project_id };
      if (b.data?.assigned_project_id && b.data.assigned_project_id !== projectId) {
        return { type: 'medium' as const, id: b.data.assigned_project_id };
      }
      return null;
    },
    enabled: !isLoading && !project && !!projectId,
    staleTime: 60_000,
  });

  useEffect(() => {
    const target = lpFallback.data;
    if (!target) return;
    if (target.type === 'large') navigate(`/large-project/${target.id}`, { replace: true });
    else navigate(`/project/${target.id}`, { replace: true });
  }, [lpFallback.data, navigate]);

  // Rental-only redirect: tvinga rental-only-projekt till översiktsvyn (inga tools)
  const rentalOnlyFlag = (project as any)?.booking?.rental_only === true;
  useEffect(() => {
    if (!rentalOnlyFlag || !projectId) return;
    const p = location.pathname;
    if (p.endsWith('/execution') || p.endsWith('/economy') || p.endsWith('/establishment')) {
      navigate(`/project/${projectId}`, { replace: true });
    }
  }, [rentalOnlyFlag, projectId, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div className="theme-purple h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-32 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        {lpFallback.isLoading || lpFallback.data ? (
          <p className="text-muted-foreground">Letar projekt…</p>
        ) : (
          <>
            <h2 className="text-xl font-semibold mb-4">Projektet hittades inte</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Det kan ha tagits bort, konverterats till ett stort projekt eller ligga under en annan bokning.
            </p>
            <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka
            </Button>
          </>
        )}
      </div>
    );
  }

  const booking = project.booking;
  const basePath = `/project/${projectId}`;
  const isRentalOnly = (booking as any)?.rental_only === true;

  // Determine active nav item
  const currentPath = location.pathname;
  const activeKey = currentPath.endsWith("/establishment")
    ? "establishment"
    : currentPath.endsWith("/economy")
    ? "economy"
    : currentPath.endsWith("/execution")
    ? "execution"
    : "overview";

  // Source-of-truth dates: prefer project's own fields, fall back to booking
  const bRef: any = (project as any).booking ?? null;
  const rigDate = project.rigdaydate || bRef?.rigdaydate || null;
  const eventDate = project.eventdate || bRef?.eventdate || null;
  const rigDownDate = project.rigdowndate || bRef?.rigdowndate || null;
  const rigStart = project.rig_start_time || bRef?.rig_start_time || null;
  const rigEnd = project.rig_end_time || bRef?.rig_end_time || null;
  const evStart = project.event_start_time || bRef?.event_start_time || null;
  const evEnd = project.event_end_time || bRef?.event_end_time || null;
  const rdStart = project.rigdown_start_time || bRef?.rigdown_start_time || null;
  const rdEnd = project.rigdown_end_time || bRef?.rigdown_end_time || null;

  const handleStartEditSubtitle = () => {
    setEditSubtitle(((project as any)?.description as string) || "");
    setIsEditingSubtitle(true);
    setTimeout(() => subtitleInputRef.current?.focus(), 50);
  };

  const handleSaveSubtitle = async () => {
    const trimmed = editSubtitle.trim();
    const current = (((project as any)?.description as string) || "").trim();
    if (trimmed === current) {
      setIsEditingSubtitle(false);
      return;
    }
    try {
      await detail.updateProject({ description: trimmed || null } as any);
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte uppdatera rubrik');
    }
    setIsEditingSubtitle(false);
  };

  const handleScheduleUpdate = async (
    dateType: 'rig' | 'event' | 'rigDown',
    dates: string[],
    startTime: string,
    endTime: string,
  ) => {
    const startField = { rig: 'rig_start_time', event: 'event_start_time', rigDown: 'rigdown_start_time' }[dateType];
    const endField = { rig: 'rig_end_time', event: 'event_end_time', rigDown: 'rigdown_end_time' }[dateType];
    try {
      // 1. Lokal projekt-rad: bara tider här (datum hanteras via central authority).
      await detail.updateProject({
        [startField]: startTime || null,
        [endField]: endTime || null,
      } as any);
      // 2. Sprid datum till sub-booking + externa systemet + rebuild calendar.
      const res = await writeProjectDates({
        projectId: projectId!,
        projectType: 'medium',
        dates: { [dateType]: dates },
      });
      if (!res.ok) throw new Error(res.error || 'apply-project-dates failed');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('Schema uppdaterat');
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte uppdatera datum');
    }
  };

  return (
    <>
    <div className="theme-purple h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header — mirrors LargeProjectLayout */}
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
                  <h1
                    className="text-xl font-bold tracking-tight leading-none"
                    style={{ color: "hsl(var(--heading))" }}
                  >
                    {project.name}
                  </h1>
                  <Badge variant="outline" className="text-xs">Medelprojekt</Badge>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 leading-none">
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
                        "hover:text-foreground transition-colors text-left truncate max-w-[400px] inline-flex items-center gap-1 group",
                        !((project as any).description) && "italic text-muted-foreground/70"
                      )}
                      title="Klicka för att ändra rubrik"
                    >
                      <span>{(project as any).description || "Lägg till rubrik..."}</span>
                      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  )}
                </div>
                {booking && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 leading-none">
                    <span>{booking.client}</span>
                    <span>·</span>
                    <span>{booking.booking_number || booking.id}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ProjectStatusDropdown status={project.status} onStatusChange={detail.updateStatus} />
              <ProjectActionMenu
                currentType="medium"
                onConvert={handleConvert}
                onDelete={handleDeleteProject}
                onConsolidate={() => setIsConsolidateOpen(true)}
              />
              <ConsolidateProjectsDialog
                open={isConsolidateOpen}
                onOpenChange={setIsConsolidateOpen}
                initialSelection={projectId ? { type: 'medium', id: projectId } : null}
                initialName={project?.name}
              />
            </div>
          </div>

          {/* Datumkort i headern — samma layout som stora projekt */}
          <div className="mt-4 pt-4 border-t border-border/40">
            <LargeProjectScheduleEditable
              startDates={rigDate ? [rigDate] : []}
              eventDates={eventDate ? [eventDate] : []}
              endDates={rigDownDate ? [rigDownDate] : []}
              startStartTime={rigStart}
              startEndTime={rigEnd}
              eventStartTime={evStart}
              eventEndTime={evEnd}
              endStartTime={rdStart}
              endEndTime={rdEnd}
              onUpdateScheduleMulti={handleScheduleUpdate}
            />
          </div>
        </div>

        {/* Address card — samma flöde som stora projekt.
            Adressen kan ligga lokalt på projektet (override) eller ärvas från
            den länkade bokningen. Visa alltid den effektiva adressen. */}
        {(() => {
          const bookingRef = (project as any).booking ?? null;
          const effectiveAddress: string | null =
            (project as any).deliveryaddress ?? bookingRef?.deliveryaddress ?? null;
          const effectiveLat: number | null =
            (project as any).delivery_latitude ?? bookingRef?.delivery_latitude ?? null;
          const effectiveLng: number | null =
            (project as any).delivery_longitude ?? bookingRef?.delivery_longitude ?? null;
          return (
            <>
              <Card className="border-border/50 shadow-sm mb-4">
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
                        effectiveAddress ? 'text-foreground' : 'text-muted-foreground italic'
                      )}>
                        {effectiveAddress || 'Ingen adress – klicka för att lägga till'}
                      </span>
                      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {effectiveLat && effectiveLng && (
                        <Badge variant="secondary" className="text-xs whitespace-nowrap">
                          📍 {Number(effectiveLat).toFixed(4)}, {Number(effectiveLng).toFixed(4)}
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
                  address: effectiveAddress ?? "",
                  latitude: effectiveLat,
                  longitude: effectiveLng,
                  radius_meters: (project as any).address_radius_meters ?? 100,
                  geofence_mode: ((project as any).address_geofence_mode as any) ?? "circle",
                  geofence_polygon: ((project as any).address_geofence_polygon as any) ?? null,
                }}
                onSave={handleAddressDialogSave}
              />
            </>
          );
        })()}

        {/* 3-page navigation — döljs för rental-only projekt (ingen rigg/utförande behövs) */}
        {!isRentalOnly && (
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
                    {!isActive && (item as any).emphasis && (
                      <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-primary/15 text-primary leading-none">
                        Hub
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}


        {/* Sub-page content */}
        <Outlet context={detail} />
      </div>
    </div>

    <AddToLargeProjectDialog
      open={!!largeProjectBookingId}
      onOpenChange={(open) => !open && setLargeProjectBookingId(null)}
      bookingId={largeProjectBookingId || ''}
    />
    </>
  );
};

export default ProjectLayout;
