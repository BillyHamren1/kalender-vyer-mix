import { useNavigate } from "react-router-dom";
import { ArrowLeft, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import JobsListPanel from "@/components/project/JobsListPanel";
import LargeProjectsListPanel from "@/components/project/LargeProjectsListPanel";
import MediumProjectsListPanel from "@/components/project/MediumProjectsListPanel";

const ProjectArchive = () => {
  const navigate = useNavigate();

  return (
    <PageContainer>
      <PageHeader
        icon={Archive}
        title="Projektarkiv"
        subtitle="Avslutade projekt"
      >
        <Button 
          onClick={() => navigate('/projects')}
          variant="outline"
          size="sm"
          className="rounded-lg h-8"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Aktiva projekt
        </Button>
      </PageHeader>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <JobsListPanel completedOnly />
        <MediumProjectsListPanel completedOnly />
        <LargeProjectsListPanel completedOnly />
      </div>
    </PageContainer>
  );
};

export default ProjectArchive;
