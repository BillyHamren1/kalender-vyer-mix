import { useMemo } from "react";
import { CheckCircle2, ListTodo, FileText, MessageSquare, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProjectTask } from "@/types/project";
import { ProjectActivity } from "@/services/projectActivityService";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

interface ProjectOverviewHeaderProps {
  tasks: ProjectTask[];
  filesCount: number;
  commentsCount: number;
  activities: ProjectActivity[];
}

const ACTION_ICONS: Record<string, string> = {
  status_changed: '🔄',
  task_added: '➕',
  task_completed: '✅',
  task_deleted: '🗑️',
  comment_added: '💬',
  file_uploaded: '📎',
  file_deleted: '📁',
};

const ProjectOverviewHeader = (_props: ProjectOverviewHeaderProps) => {
  return null;
};

export default ProjectOverviewHeader;
