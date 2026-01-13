import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectStatus, PROJECT_STATUS_LABELS } from "@/types/project";

interface ProjectStatusDropdownProps {
  status: ProjectStatus;
  onStatusChange: (status: ProjectStatus) => void;
}

const ProjectStatusDropdown = ({ status, onStatusChange }: ProjectStatusDropdownProps) => {
  return (
    <Select value={status} onValueChange={(v) => onStatusChange(v as ProjectStatus)}>
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ProjectStatusDropdown;
