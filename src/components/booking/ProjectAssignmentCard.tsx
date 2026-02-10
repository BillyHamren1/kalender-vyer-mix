
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Folder, FolderOpen } from 'lucide-react';

interface ProjectAssignmentCardProps {
  assignedProjectId?: string;
  assignedProjectName?: string;
  assignedToProject?: boolean;
}

const ProjectAssignmentCard: React.FC<ProjectAssignmentCardProps> = ({
  assignedProjectId,
  assignedProjectName,
  assignedToProject
}) => {
  const hasProjectAssignment = assignedToProject && (assignedProjectId || assignedProjectName);

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          {hasProjectAssignment ? (
            <FolderOpen className="h-4 w-4 text-primary" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground" />
          )}
          <span>Projekttilldelning</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        {hasProjectAssignment ? (
          <div className="space-y-2">
            <Badge className="bg-primary text-primary-foreground">
              Tilldelad till projekt
            </Badge>
            {assignedProjectName && (
              <p className="text-sm font-medium">{assignedProjectName}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Inte tilldelad till något projekt.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectAssignmentCard;
