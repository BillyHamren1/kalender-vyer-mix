import { useNavigate } from "react-router-dom";
import { ArrowLeft, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import JobsListPanel from "@/components/project/JobsListPanel";
import LargeProjectsListPanel from "@/components/project/LargeProjectsListPanel";
import MediumProjectsListPanel from "@/components/project/MediumProjectsListPanel";

const ProjectArchive = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Header */}
        <div className="relative mb-10">
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-muted-foreground/5 rounded-full blur-3xl" />
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-card/80 via-card to-card/80 backdrop-blur-sm border border-border/50 shadow-lg">
            <div className="flex items-center gap-4">
              <div 
                className="relative p-3.5 rounded-2xl bg-gradient-to-br from-muted-foreground/60 to-muted-foreground/40 shadow-lg"
              >
                <Archive className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Projektarkiv
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  Avslutade projekt
                </p>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/projects')}
              variant="outline"
              size="lg"
              className="rounded-xl px-6"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Aktiva projekt
            </Button>
          </div>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <JobsListPanel completedOnly />
          <MediumProjectsListPanel completedOnly />
          <LargeProjectsListPanel completedOnly />
        </div>
      </div>
    </div>
  );
};

export default ProjectArchive;
