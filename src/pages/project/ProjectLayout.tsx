import { useState } from "react";
import { useParams, useNavigate, Outlet, useLocation, Link } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, HardHat, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import ProjectActionMenu from "@/components/project/ProjectActionMenu";
import { AddToLargeProjectDialog } from "@/components/project/AddToLargeProjectDialog";
import { useProjectDetail } from "@/hooks/useProjectDetail";
import { deleteProject } from "@/services/projectService";
import { convertToMedium, prepareConvertToLarge, type ProjectType } from "@/services/projectConversionService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const navItems = [
  { key: "overview", label: "Projektvy", icon: LayoutDashboard, path: "" },
  { key: "establishment", label: "Etableringsschema", icon: HardHat, path: "/establishment" },
  { key: "economy", label: "Projektekonomi", icon: Wallet, path: "/economy" },
];

const ProjectLayout = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [largeProjectBookingId, setLargeProjectBookingId] = useState<string | null>(null);

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
    if (!confirm(`Ta bort medelprojekt: "${project?.name}"?\n\nBokningen kommer att frigöras och kan tilldelas ett nytt projekt.`)) return;
    try {
      await deleteProject(projectId!);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      toast.success('Medelprojekt borttaget');
      navigate('/projects');
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte ta bort projekt');
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
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
        <h2 className="text-xl font-semibold mb-4">Projektet hittades inte</h2>
        <Button onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tillbaka
        </Button>
      </div>
    );
  }

  const booking = project.booking;
  const basePath = `/project/${projectId}`;

  // Determine active nav item
  const currentPath = location.pathname;
  const activeKey = currentPath.endsWith("/establishment")
    ? "establishment"
    : currentPath.endsWith("/economy")
    ? "economy"
    : "overview";

  return (
    <>
    <div className="h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/projects")} className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{ color: "hsl(var(--heading))" }}
              >
                {project.name}
              </h1>
              {booking && (
                <p className="text-sm text-muted-foreground">
                  {booking.client} • {booking.booking_number || booking.id}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProjectStatusDropdown status={project.status} onStatusChange={detail.updateStatus} />
            <ProjectActionMenu
              currentType="medium"
              onConvert={handleConvert}
              onDelete={handleDeleteProject}
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
