import { useParams, useNavigate } from "react-router-dom";
import ProjectSiteScans from "@/features/site-scans/components/project/ProjectSiteScans";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FolderOpen } from "lucide-react";

const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1.5 text-muted-foreground -ml-2 mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Tillbaka
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/8 border border-primary/10 flex items-center justify-center">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading">Projekt</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {projectId ?? "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Site Scans section */}
      <ProjectSiteScans projectId={projectId} />
    </div>
  );
};

export default ProjectDetail;
