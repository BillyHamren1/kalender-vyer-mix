import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { sampleResources, sampleEvents, Resource } from '../components/Calendar/ResourceData';
import { Button } from '@/components/ui/button';
import { Edit } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import TeamManager from '@/components/Calendar/TeamManager';

const ResourceView = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [resources, setResources] = useState<Resource[]>(sampleResources);
  const [teamCount, setTeamCount] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  
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

  const removeTeam = (teamId: string) => {
    const teamToRemove = resources.find(resource => resource.id === teamId);
    if (!teamToRemove) return;
    
    setResources(resources.filter(resource => resource.id !== teamId));
    
    toast({
      title: "Team borttaget",
      description: `${teamToRemove.title} har tagits bort från kalendern`,
      duration: 3000,
    });
  };

  // Get only the team resources (not room resources)
  const teamResources = resources.filter(resource => resource.id.startsWith('team-'));
  // Get only the non-team resources (room resources)
  const roomResources = resources.filter(resource => !resource.id.startsWith('team-'));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Resursvy</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-purple-500 hover:bg-purple-600 text-white"
              >
                <Edit className="mr-1" size={18} />
                Edit team
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Hantera Teams</DialogTitle>
                <DialogDescription>
                  Lägg till eller ta bort team i kalendern.
                </DialogDescription>
              </DialogHeader>
              <TeamManager 
                teams={teamResources} 
                onAddTeam={addTeam} 
                onRemoveTeam={removeTeam} 
                teamCount={teamCount}
              />
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          {isMounted && (
            <FullCalendar
              plugins={[resourceTimeGridPlugin, timeGridPlugin]}
              initialView="resourceTimeGridDay"
              resources={resources}
              events={sampleEvents}
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'resourceTimeGridDay,timeGridWeek'
              }}
              views={{
                resourceTimeGridDay: {
                  type: 'resourceTimeGrid',
                  duration: { days: 1 }
                },
                timeGridWeek: {
                  type: 'timeGrid',
                  duration: { weeks: 1 },
                  dayMaxEventRows: false, // display all events
                  eventDisplay: 'block', // display as blocks
                  eventOverlap: false, // don't allow events to overlap
                  eventShortHeight: 20, // minimum height of an event
                  slotEventOverlap: false // events won't overlap in time slots
                }
              }}
              slotDuration="00:30:00"
              allDaySlot={false}
              locale="sv"
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
