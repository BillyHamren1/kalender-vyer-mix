import { MapPin, Clock, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffLocation } from "@/services/planningDashboardService";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface StaffLocationsCardProps {
  locations: StaffLocation[];
  isLoading: boolean;
}

const StaffLocationsCard = ({ locations, isLoading }: StaffLocationsCardProps) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Personal på plats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const workingStaff = locations.filter(s => s.isWorking);
  const assignedStaff = locations.filter(s => !s.isWorking);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Personal på plats ({locations.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-6 pb-6">
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Ingen personal tilldelad idag
            </p>
          ) : (
            <div className="space-y-3">
              {/* Working now section */}
              {workingStaff.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-green-600 uppercase tracking-wide">
                    Arbetar just nu ({workingStaff.length})
                  </p>
                  {workingStaff.map((staff) => (
                    <StaffLocationItem key={staff.id} staff={staff} isActive />
                  ))}
                </div>
              )}

              {/* Assigned section */}
              {assignedStaff.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4">
                    Tilldelade ({assignedStaff.length})
                  </p>
                  {assignedStaff.map((staff) => (
                    <StaffLocationItem key={staff.id} staff={staff} />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const StaffLocationItem = ({ staff, isActive }: { staff: StaffLocation; isActive?: boolean }) => {
  return (
    <div className={`p-3 rounded-lg border ${isActive ? 'border-green-200 bg-green-50' : 'bg-muted/30'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">{staff.name}</span>
        </div>
        <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
          {staff.teamName}
        </Badge>
      </div>
      
      {staff.bookingClient && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          {staff.bookingClient}
        </p>
      )}
      
      {staff.deliveryAddress && (
        <div className="flex items-start gap-1 mt-1 ml-6">
          <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-xs text-muted-foreground line-clamp-1">
            {staff.deliveryAddress}
          </span>
        </div>
      )}

      {staff.latitude && staff.longitude && (
        <a 
          href={`https://www.google.com/maps?q=${staff.latitude},${staff.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline ml-6 inline-block mt-1"
        >
          Visa på karta →
        </a>
      )}

      {staff.lastReportTime && (
        <div className="flex items-center gap-1 mt-1 ml-6">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Senast: {format(new Date(staff.lastReportTime), 'HH:mm', { locale: sv })}
          </span>
        </div>
      )}
    </div>
  );
};

export default StaffLocationsCard;
