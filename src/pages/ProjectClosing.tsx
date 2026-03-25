import { FolderKanban, AlertCircle } from "lucide-react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import ClosingProjectsList from "@/components/project/ClosingProjectsList";

const ProjectClosing = () => {
  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={AlertCircle}
        title="Under slutförande"
        subtitle="Projekt som passerat eventdatum och bör stängas"
        variant="purple"
      />
      <ClosingProjectsList />
    </PageContainer>
  );
};

export default ProjectClosing;
