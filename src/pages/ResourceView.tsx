
import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import { sampleResources, sampleEvents, Resource } from '../components/Calendar/ResourceData';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const ResourceView = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [resources, setResources] = useState<Resource[]>(sampleResources);
  const [teamCount, setTeamCount] = useState(1);
  
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const addTeam = () => {
    const newTeamId = `team-${teamCount}`;
    const newResource: Resource = {
      id: newTeamId,
      title: `Team ${teamCount}`,
      eventColor: '#9b87f5'
    };
    
    setResources([...resources, newResource]);
    setTeamCount(prevCount => prevCount + 1);
    
    toast({
      title: "Team tillagt",
      description: `Team ${teamCount} har lagts till i kalendern`,
      duration: 3000,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Resursvy</h1>
          <Button 
            onClick={addTeam}
            className="bg-purple-500 hover:bg-purple-600 text-white"
          >
            <Plus className="mr-1" size={18} />
            Lägg till Team
          </Button>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          {isMounted && (
            <FullCalendar
              plugins={[resourceTimeGridPlugin]}
              initialView="resourceTimeGridDay"
              resources={resources}
              events={sampleEvents}
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'resourceTimeGridDay,resourceTimeGridWeek'
              }}
              slotDuration="00:30:00"
              allDaySlot={false}
              locale="sv"
              resourceLabelDidMount={(info) => {
                console.log("Resource label mounted:", info.resource.title);
              }}
              datesSet={(dateInfo) => {
                console.log("Date range changed:", dateInfo.startStr, "to", dateInfo.endStr);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ResourceView;
