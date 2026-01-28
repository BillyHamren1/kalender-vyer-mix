import { Users, Power, UserCheck, UserX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useDrag } from "react-dnd";
import { toast } from "sonner";

export interface StaffMember {
  id: string;
  name: string;
  color: string | null;
  role: string | null;
  isActive: boolean;
  currentTeam: string | null;
  currentTeamName: string | null;
}

interface AllStaffCardProps {
  staff: StaffMember[];
  isLoading: boolean;
  onToggleActive: (staffId: string, isActive: boolean) => Promise<void>;
}

export const DRAG_TYPE_STAFF = 'STAFF_MEMBER';

const DraggableStaffItem = ({ 
  person, 
  onToggleActive 
}: { 
  person: StaffMember; 
  onToggleActive: (staffId: string, isActive: boolean) => Promise<void>;
}) => {
  const navigate = useNavigate();
  
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DRAG_TYPE_STAFF,
    item: { id: person.id, name: person.name, color: person.color },
    canDrag: person.isActive,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [person]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onToggleActive(person.id, !person.isActive);
      toast.success(`${person.name} är nu ${!person.isActive ? 'aktiv' : 'inaktiv'}`);
    } catch (error) {
      toast.error('Kunde inte uppdatera status');
    }
  };

  return (
    <div 
      ref={drag as any}
      className={`flex items-center gap-2 p-2 rounded-lg border bg-card transition-all
        ${person.isActive ? 'hover:bg-muted/50 cursor-grab' : 'opacity-60 cursor-default'}
        ${isDragging ? 'opacity-50 scale-95' : ''}`}
      onClick={() => navigate(`/staff/${person.id}`)}
    >
      <div 
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: person.color || '#E3F2FD' }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium truncate">{person.name}</p>
          {person.currentTeamName && (
            <span className="text-xs text-muted-foreground">({person.currentTeamName})</span>
          )}
        </div>
        {person.role && (
          <p className="text-xs text-muted-foreground truncate">{person.role}</p>
        )}
      </div>
      <div 
        onClick={handleToggle}
        className="shrink-0 flex items-center gap-1 cursor-pointer"
      >
        {person.isActive ? (
          <UserCheck className="w-4 h-4 text-primary" />
        ) : (
          <UserX className="w-4 h-4 text-muted-foreground" />
        )}
        <Switch 
          checked={person.isActive}
          className="scale-75"
        />
      </div>
    </div>
  );
};

const AllStaffCard = ({ staff, isLoading, onToggleActive }: AllStaffCardProps) => {
  const activeStaff = staff.filter(s => s.isActive);
  const inactiveStaff = staff.filter(s => !s.isActive);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            All personal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            All personal ({staff.length})
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {activeStaff.length} aktiva
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[350px] px-6 pb-6">
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Ingen personal hittades
            </p>
          ) : (
            <div className="space-y-4">
              {/* Active staff */}
              {activeStaff.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-primary uppercase tracking-wide flex items-center gap-1">
                    <Power className="w-3 h-3" />
                    Aktiva ({activeStaff.length})
                  </p>
                  <div className="space-y-1">
                    {activeStaff.map((person) => (
                      <DraggableStaffItem 
                        key={person.id} 
                        person={person} 
                        onToggleActive={onToggleActive}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Inactive staff */}
              {inactiveStaff.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Power className="w-3 h-3" />
                    Inaktiva ({inactiveStaff.length})
                  </p>
                  <div className="space-y-1">
                    {inactiveStaff.map((person) => (
                      <DraggableStaffItem 
                        key={person.id} 
                        person={person} 
                        onToggleActive={onToggleActive}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default AllStaffCard;
