import React from 'react';
import { useDashboard } from "@/hooks/useDashboard";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { UpcomingEventsTimeline } from "@/components/dashboard/UpcomingEventsTimeline";
import { TasksAttentionList } from "@/components/dashboard/TasksAttentionList";
import { ActiveProjectsCard } from "@/components/dashboard/ActiveProjectsCard";
import { StaffStatusCard } from "@/components/dashboard/StaffStatusCard";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { 
    stats, 
    events, 
    tasks, 
    projects, 
    staffStatus, 
    activities, 
    isLoading,
    refetchAll 
  } = useDashboard();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Översikt över EventFlow-systemet</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refetchAll}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>

        {/* Stats Row */}
        <DashboardStats stats={stats} isLoading={isLoading} />

        {/* Timeline */}
        <UpcomingEventsTimeline events={events} isLoading={isLoading} />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tasks - Takes 1 column on large screens */}
          <div className="lg:col-span-1">
            <TasksAttentionList tasks={tasks} isLoading={isLoading} />
          </div>

          {/* Projects and Staff - Takes 2 columns on large screens */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <ActiveProjectsCard projects={projects} isLoading={isLoading} />
            <StaffStatusCard staffStatus={staffStatus} isLoading={isLoading} />
          </div>
        </div>

        {/* Activity Feed */}
        <RecentActivityFeed activities={activities} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default Index;
