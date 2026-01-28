import { Users, UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AvailableStaff } from "@/services/planningDashboardService";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface AvailableStaffCardProps {
  staff: AvailableStaff[];
  isLoading: boolean;
}

const AvailableStaffCard = ({ staff, isLoading }: AvailableStaffCardProps) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-green-600" />
            Tillgängliga för bokning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
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
            <UserCheck className="w-5 h-5 text-green-600" />
            Tillgängliga för bokning ({staff.length})
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/calendar')}
            className="text-primary"
          >
            Planera →
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-6 pb-6">
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Ingen tillgänglig personal just nu
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {staff.map((person) => (
                <div 
                  key={person.id}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/staff/${person.id}`)}
                >
                  <div 
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: person.color || '#E3F2FD' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{person.name}</p>
                    {person.role && (
                      <p className="text-xs text-muted-foreground truncate">{person.role}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default AvailableStaffCard;
