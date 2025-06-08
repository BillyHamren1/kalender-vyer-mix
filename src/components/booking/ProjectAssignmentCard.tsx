
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
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {hasProjectAssignment ? (
            <FolderOpen className="h-5 w-5 text-blue-600" />
          ) : (
            <Folder className="h-5 w-5 text-gray-400" />
          )}
          Project Assignment
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasProjectAssignment ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Assigned to Project
              </Badge>
            </div>
            {assignedProjectName && (
              <div>
                <p className="text-sm text-gray-600">Project Name:</p>
                <p className="font-medium">{assignedProjectName}</p>
              </div>
            )}
            {assignedProjectId && (
              <div>
                <p className="text-sm text-gray-600">Project ID:</p>
                <p className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                  {assignedProjectId}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-500">
            <p>This booking is not assigned to any project.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectAssignmentCard;
