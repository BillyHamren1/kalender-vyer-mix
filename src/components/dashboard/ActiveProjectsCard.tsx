import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { ActiveProject } from "@/services/dashboardService";

interface ActiveProjectsCardProps {
  projects: ActiveProject[];
  isLoading: boolean;
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'planning':
      return 'Planering';
    case 'in_progress':
      return 'Pågående';
    case 'completed':
      return 'Slutfört';
    default:
      return status;
  }
};

export const ActiveProjectsCard: React.FC<ActiveProjectsCardProps> = ({ projects, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Aktiva projekt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2 mb-2" />
                <div className="h-2 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Aktiva projekt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Inga aktiva projekt</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Aktiva projekt
          </CardTitle>
          <ChevronRight 
            className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-foreground" 
            onClick={() => navigate('/projects')}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {projects.map(project => (
          <div
            key={project.id}
            className="p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/project/${project.id}`)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{project.name}</h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {project.eventDate && (
                    <span>{format(new Date(project.eventDate), 'd MMM', { locale: sv })}</span>
                  )}
                  <span>•</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {getStatusLabel(project.status)}
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {project.completedTasks}/{project.totalTasks} uppgifter
                </span>
                <span className="font-medium">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-1.5" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
