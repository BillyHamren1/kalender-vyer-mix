
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileDayDetailViewProps {
  selectedDate: Date;
  events: CalendarEvent[];
  resources: Resource[];
  onBack: () => void;
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onOpenStaffSelection?: (resourceId: string, resourceTitle: string, targetDate: Date, buttonElement?: HTMLElement) => void;
  weeklyStaffOperations?: any;
}

const MobileDayDetailView: React.FC<MobileDayDetailViewProps> = ({
  selectedDate,
  events,
  resources,
  onBack,
  onOpenStaffSelection,
  weeklyStaffOperations
}) => {
  // Filter events for the selected date
  const dayEvents = events.filter(event => {
    const eventDate = format(new Date(event.start), 'yyyy-MM-dd');
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    return eventDate === selectedDateStr;
  });

  // Group events by resource/team
  const eventsByResource = dayEvents.reduce((acc, event) => {
    if (!acc[event.resourceId]) acc[event.resourceId] = [];
    acc[event.resourceId].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // Get event color based on type
  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'rig': return 'bg-green-500';
      case 'event': return 'bg-yellow-500';
      case 'rigDown': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };

  // Get staff for a team on this date
  const getTeamStaff = (teamId: string) => {
    if (!weeklyStaffOperations) return [];
    const staff = weeklyStaffOperations.getStaffForTeamAndDate(teamId, selectedDate);
    return Array.isArray(staff) ? staff : [];
  };

  const handleAddStaff = (teamId: string, teamTitle: string, event: React.MouseEvent) => {
    if (onOpenStaffSelection) {
      onOpenStaffSelection(teamId, teamTitle, selectedDate, event.currentTarget as HTMLElement);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        
        <h2 className="text-lg font-semibold">
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </h2>
      </div>

      {/* Teams and Events */}
      <div className="p-4 space-y-4">
        {resources.map(resource => {
          const resourceEvents = eventsByResource[resource.id] || [];
          const teamStaff = getTeamStaff(resource.id);
          
          return (
            <div key={resource.id} className="border rounded-lg">
              {/* Team Header */}
              <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{resource.title}</h3>
                  {teamStaff.length > 0 && (
                    <span className="text-sm text-gray-500">
                      ({teamStaff.length} staff)
                    </span>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleAddStaff(resource.id, resource.title, e)}
                  className="flex items-center gap-1"
                >
                  <Users className="h-3 w-3" />
                  Staff
                </Button>
              </div>

              {/* Staff List */}
              {teamStaff.length > 0 && (
                <div className="p-3 border-b bg-blue-50">
                  <div className="flex flex-wrap gap-2">
                    {teamStaff.map(staff => (
                      <span
                        key={staff.id}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                        style={{ 
                          backgroundColor: staff.color || '#E3F2FD',
                          color: '#1976D2'
                        }}
                      >
                        {staff.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Events */}
              <div className="p-3">
                {resourceEvents.length > 0 ? (
                  <div className="space-y-2">
                    {resourceEvents.map(event => (
                      <div
                        key={event.id}
                        className={`
                          p-3 rounded-lg text-white
                          ${getEventColor(event.eventType || 'event')}
                        `}
                      >
                        <div className="font-medium text-sm">
                          {event.extendedProps?.client || event.title}
                        </div>
                        <div className="text-xs opacity-90 mt-1">
                          {format(new Date(event.start), 'HH:mm')} - {format(new Date(event.end), 'HH:mm')}
                        </div>
                        {event.extendedProps?.deliveryAddress && (
                          <div className="text-xs opacity-90 mt-1">
                            📍 {event.extendedProps.deliveryAddress}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    No events scheduled
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MobileDayDetailView;
