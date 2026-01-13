import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { PlannedStaffMember } from '@/types/projectStaff';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface PlannedStaffSectionProps {
  staff: PlannedStaffMember[];
  isLoading: boolean;
}

const getEventTypeLabel = (eventType: string | null): string => {
  switch (eventType) {
    case 'rigg': return 'Rigg';
    case 'event': return 'Event';
    case 'nedrigg': return 'Nedrigg';
    default: return '';
  }
};

const getEventTypeBadgeVariant = (eventType: string | null): 'default' | 'secondary' | 'outline' => {
  switch (eventType) {
    case 'rigg': return 'secondary';
    case 'event': return 'default';
    case 'nedrigg': return 'outline';
    default: return 'secondary';
  }
};

export const PlannedStaffSection = ({ staff, isLoading }: PlannedStaffSectionProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Planerad personal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Laddar...</div>
        </CardContent>
      </Card>
    );
  }

  if (staff.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Planerad personal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Ingen personal har tilldelats detta projekt ännu.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Planerad personal ({staff.length} personer)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member) => (
            <div
              key={member.staff_id}
              className="border rounded-lg p-4 space-y-3"
              style={{ borderLeftColor: member.color || '#E3F2FD', borderLeftWidth: '4px' }}
            >
              <div>
                <h4 className="font-medium">{member.staff_name}</h4>
                {member.role && (
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {member.assignment_dates.map((assignment, idx) => (
                  <Badge
                    key={idx}
                    variant={getEventTypeBadgeVariant(assignment.event_type)}
                    className="text-xs"
                  >
                    {format(new Date(assignment.date), 'd MMM', { locale: sv })}
                    {assignment.event_type && ` (${getEventTypeLabel(assignment.event_type)})`}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
