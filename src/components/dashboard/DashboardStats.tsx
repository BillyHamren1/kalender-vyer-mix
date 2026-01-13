import React from 'react';
import { Card } from "@/components/ui/card";
import { Calendar, FolderOpen, AlertTriangle, Users, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DashboardStats as DashboardStatsType } from "@/services/dashboardService";

interface DashboardStatsProps {
  stats: DashboardStatsType | undefined;
  isLoading: boolean;
}

const StatCard = ({ 
  icon: Icon, 
  value, 
  label, 
  onClick,
  variant = 'default'
}: { 
  icon: React.ElementType;
  value: number;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'warning' | 'success';
}) => {
  const bgClass = variant === 'warning' 
    ? 'bg-destructive/10 border-destructive/20' 
    : variant === 'success'
    ? 'bg-green-50 border-green-200'
    : 'bg-card border-border';

  const iconClass = variant === 'warning'
    ? 'text-destructive'
    : variant === 'success'
    ? 'text-green-600'
    : 'text-primary';

  return (
    <Card 
      className={`p-4 cursor-pointer transition-all hover:shadow-md ${bgClass}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-background ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </Card>
  );
};

export const DashboardStats: React.FC<DashboardStatsProps> = ({ stats, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-muted rounded-lg" />
              <div className="space-y-2">
                <div className="h-6 w-12 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        icon={Calendar}
        value={stats?.upcomingJobs || 0}
        label="Kommande jobb"
        onClick={() => navigate('/calendar')}
      />
      <StatCard
        icon={FolderOpen}
        value={stats?.activeProjects || 0}
        label="Aktiva projekt"
        onClick={() => navigate('/projects')}
      />
      <StatCard
        icon={AlertTriangle}
        value={stats?.overdueTasks || 0}
        label="Förfallna uppgifter"
        variant={stats?.overdueTasks && stats.overdueTasks > 0 ? 'warning' : 'default'}
        onClick={() => navigate('/projects')}
      />
      <StatCard
        icon={Users}
        value={stats?.totalStaff || 0}
        label="Personal"
        onClick={() => navigate('/staff-management')}
      />
      <StatCard
        icon={CheckCircle}
        value={stats?.confirmedBookings || 0}
        label="Bekräftade bokningar"
        variant="success"
        onClick={() => navigate('/booking-list')}
      />
    </div>
  );
};
