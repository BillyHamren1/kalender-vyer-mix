import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Bell, CheckCircle, FolderPlus, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import { RecentActivity } from "@/services/dashboardService";

interface RecentActivityFeedProps {
  activities: RecentActivity[];
  isLoading: boolean;
}

const getActivityIcon = (type: RecentActivity['type']) => {
  switch (type) {
    case 'booking':
      return <Bell className="h-4 w-4 text-blue-500" />;
    case 'project':
      return <FolderPlus className="h-4 w-4 text-purple-500" />;
    case 'task':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'staff':
      return <UserPlus className="h-4 w-4 text-orange-500" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
};

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({ activities, isLoading }) => {
  const navigate = useNavigate();

  const handleActivityClick = (activity: RecentActivity) => {
    if (!activity.relatedId) return;
    
    switch (activity.type) {
      case 'booking':
        navigate(`/booking/${activity.relatedId}`);
        break;
      case 'project':
        navigate(`/project/${activity.relatedId}`);
        break;
      case 'task':
        // Tasks don't have a dedicated page, navigate to projects
        navigate('/projects');
        break;
      case 'staff':
        navigate(`/staff/${activity.relatedId}`);
        break;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Senaste aktivitet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 bg-muted rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-3/4 mb-1" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Senaste aktivitet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Ingen aktivitet ännu</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Senaste aktivitet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map(activity => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => handleActivityClick(activity)}
            >
              <div className="p-2 rounded-full bg-muted">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{activity.message}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(activity.timestamp, { 
                    addSuffix: true, 
                    locale: sv 
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
