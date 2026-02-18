import { useParams, useNavigate, Outlet, useLocation, Link } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, HardHat, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectStatusDropdown from "@/components/project/ProjectStatusDropdown";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import { useProjectDetail } from "@/hooks/useProjectDetail";
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

  const detail = useProjectDetail(projectId || "");
  const { project, isLoading } = detail;

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
    <div className="h-full overflow-y-auto" style={{ background: "var(--gradient-page)" }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
          <ProjectStatusDropdown status={project.status} onStatusChange={detail.updateStatus} />
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

        {/* Booking info – only on project overview */}
        {booking && activeKey === "overview" && (
          <BookingInfoExpanded
            booking={booking}
            projectLeader={project.project_leader}
            bookingAttachments={detail.bookingAttachments}
          />
        )}

        {/* Sub-page content */}
        <Outlet context={detail} />
      </div>
    </div>
  );
};

export default ProjectLayout;
