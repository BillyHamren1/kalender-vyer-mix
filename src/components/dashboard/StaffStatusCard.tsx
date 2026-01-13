import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronRight, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StaffTodayStatus } from "@/services/dashboardService";

interface StaffStatusCardProps {
  staffStatus: StaffTodayStatus;
  isLoading: boolean;
}

export const StaffStatusCard: React.FC<StaffStatusCardProps> = ({ staffStatus, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Personalstatus idag
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalStaff = staffStatus.assigned.length + staffStatus.available.length;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Personalstatus idag
          </CardTitle>
          <ChevronRight 
            className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-foreground" 
            onClick={() => navigate('/staff-management')}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Tilldelade: <span className="font-semibold text-foreground">{staffStatus.assigned.length}/{totalStaff}</span> personer
        </div>

        {staffStatus.assigned.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Tilldelade</h4>
            <div className="space-y-1">
              {staffStatus.assigned.slice(0, 4).map(staff => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-200 cursor-pointer hover:bg-green-100 transition-colors"
                  onClick={() => navigate(`/staff/${staff.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium">{staff.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {staff.teamId}
                  </Badge>
                </div>
              ))}
              {staffStatus.assigned.length > 4 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{staffStatus.assigned.length - 4} fler
                </div>
              )}
            </div>
          </div>
        )}

        {staffStatus.available.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Lediga</h4>
            <div className="flex flex-wrap gap-2">
              {staffStatus.available.slice(0, 6).map(staff => (
                <Badge
                  key={staff.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => navigate(`/staff/${staff.id}`)}
                >
                  <User className="h-3 w-3 mr-1" />
                  {staff.name.split(' ')[0]}
                </Badge>
              ))}
              {staffStatus.available.length > 6 && (
                <Badge variant="outline">
                  +{staffStatus.available.length - 6}
                </Badge>
              )}
            </div>
          </div>
        )}

        {staffStatus.assigned.length === 0 && staffStatus.available.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Ingen personal registrerad</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
