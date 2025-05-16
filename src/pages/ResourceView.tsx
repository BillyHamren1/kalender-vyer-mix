
import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import { 
  sampleResources, 
  Resource, 
  CalendarEvent, 
  getEventColor, 
  generateEventId,
  saveResourcesToStorage,
  loadResourcesFromStorage
} from '../components/Calendar/ResourceData';
import { Button } from '@/components/ui/button';
import { Edit } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import TeamManager from '@/components/Calendar/TeamManager';
import '../styles/calendar.css';
import { useNavigate } from 'react-router-dom';
import { fetchCalendarEvents, updateCalendarEvent, saveResources } from '@/services/calendarService';

const ResourceView = () => {
  
  const [isMounted, setIsMounted] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamCount, setTeamCount] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  
  // Get the date from URL or session storage if it exists
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const storedDate = sessionStorage.getItem('calendarDate');
    return storedDate ? new Date(storedDate) : new Date();
  });
  
  
  useEffect(() => {
    const loadedResources = loadResourcesFromStorage();
    setResources(loadedResources);
    
    // Set teamCount based on the highest team number
    const teamIds = loadedResources
      .filter(res => res.id.startsWith('team-'))
      .map(res => {
        const match = res.id.match(/team-(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });
    
    const maxTeamNumber = teamIds.length > 0 ? Math.max(...teamIds) : 0;
    setTeamCount(maxTeamNumber + 1);
  }, []);
  
  
  useEffect(() => {
    const loadEvents = async () => {
      try {
        setIsLoading(true);
        const data = await fetchCalendarEvents();
        
        // If there are no events from the database, try to get them from localStorage
        if (data.length === 0) {
          const storedEvents = localStorage.getItem('calendarEvents');
          if (storedEvents) {
            try {
              setEvents(JSON.parse(storedEvents));
            } catch (error) {
              console.error('Error parsing stored events:', error);
            }
          }
        } else {
          setEvents(data);
          // Store the events in localStorage as a cache
          localStorage.setItem('calendarEvents', JSON.stringify(data));
        }
      } catch (error) {
        console.error('Error loading calendar events:', error);
        
        // Fallback to localStorage if API fails
        const storedEvents = localStorage.getItem('calendarEvents');
        if (storedEvents) {
          try {
            setEvents(JSON.parse(storedEvents));
          } catch (error) {
            console.error('Error parsing stored events:', error);
          }
        }
        
        toast.error('Failed to load calendar events');
      } finally {
        setIsLoading(false);
        setIsMounted(true);
      }
    };
    
    loadEvents();
    
    return () => setIsMounted(false);
  }, []);

  

  useEffect(() => {
    if (events.length > 0) {
      localStorage.setItem('calendarEvents', JSON.stringify(events));
    }
  }, [events]);
  
  useEffect(() => {
    if (resources.length > 0) {
      saveResourcesToStorage(resources);
      saveResources(resources);
    }
  }, [resources]);

  

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

  const handleEventChange = async (info: any) => {
    
    try {
      const resourceId = info.event.getResources()[0]?.id || info.event._def.resourceIds[0];
      
      // Update the event in our state
      const updatedEvents = events.map(event => {
        if (event.id === info.event.id) {
          return {
            ...event,
            start: info.event.start.toISOString(),
            end: info.event.end.toISOString(),
            resourceId: resourceId
          };
        }
        return event;
      });
      
      setEvents(updatedEvents);
      
      // Update the event in the database
      if (info.event.id) {
        await updateCalendarEvent(info.event.id, {
          start: info.event.start.toISOString(),
          end: info.event.end.toISOString(),
          resourceId: resourceId
        });
      }
      
      // Find the team name for the toast message
      const resourceName = resources.find(r => r.id === resourceId)?.title || resourceId;
      
      toast(`Event flyttat`, {
        description: `Eventet har flyttats till ${resourceName} vid ${info.event.start.toLocaleTimeString()}`,
      });
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  

  // Handle navigation to booking details when an event is clicked
  const handleEventClick = (info: any) => {
    const bookingId = info.event.extendedProps.bookingId;
    if (bookingId) {
      // Save current date to session storage before navigating
      sessionStorage.setItem('calendarDate', currentDate.toISOString());
      sessionStorage.setItem('calendarView', info.view.type);
      
      // Navigate to booking details
      navigate(`/booking/${bookingId}`);
    } else {
      console.log('Event clicked:', info.event.title);
    }
  };
  
  // Function to find the first available team for a new event
  const findAvailableTeam = (eventStartTime: Date, eventEndTime: Date): string => {
    const teamResources = resources.filter(resource => resource.id.startsWith('team-'));
    if (teamResources.length === 0) return 'team-1'; // Default if no teams exist
    
    // Find all teams without events at the given time slot
    const busyTeams = new Set<string>();
    
    events.forEach(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      
      // Check if the event overlaps with the new time slot
      if (
        (eventStartTime <= eventEnd && eventEndTime >= eventStart) &&
        event.resourceId.startsWith('team-')
      ) {
        busyTeams.add(event.resourceId);
      }
    });
    
    // Find first available team
    for (const team of teamResources) {
      if (!busyTeams.has(team.id)) {
        return team.id;
      }
    }
    
    // If all teams are busy, return the first team
    return teamResources[0].id;
  };
  
  // Function to add new events to the calendar
  const addEventToCalendar = (event: Omit<CalendarEvent, 'id'>) => {
    // If no resourceId is provided, find an available team
    let resourceId = event.resourceId;
    
    if (!resourceId || resourceId === 'auto') {
      const eventStartTime = new Date(event.start);
      const eventEndTime = new Date(event.end);
      resourceId = findAvailableTeam(eventStartTime, eventEndTime);
    }
    
    const newEvent: CalendarEvent = {
      ...event,
      id: generateEventId(),
      color: getEventColor(event.eventType),
      resourceId: resourceId
    };
    
    setEvents(prevEvents => [...prevEvents, newEvent]);
    console.log("New event added:", newEvent);
    return newEvent.id;
  };
  
  const handleDatesSet = (dateInfo: any) => {
    setCurrentDate(dateInfo.start);
    console.log("Date range changed:", dateInfo.startStr, "to", dateInfo.endStr);
  };
  
  // Expose the add event function to window for BookingDetail.tsx to use
  useEffect(() => {
    // @ts-ignore
    window.addEventToCalendar = addEventToCalendar;
    
    return () => {
      // @ts-ignore
      delete window.addEventToCalendar;
    };
  }, [events, resources]);

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
                className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white"
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
          {isLoading ? (
            <div className="flex justify-center items-center p-12">
              <p className="text-gray-500">Loading calendar...</p>
            </div>
          ) : isMounted && (
            <FullCalendar
              plugins={[resourceTimeGridPlugin, timeGridPlugin, interactionPlugin, dayGridPlugin]}
              initialView="resourceTimeGridDay"
              initialDate={currentDate}
              resources={resources}
              events={events}
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'resourceTimeGridDay,timeGridWeek,dayGridMonth'
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
                },
                dayGridMonth: {
                  type: 'dayGrid',
                  duration: { months: 1 },
                  dayMaxEventRows: true, // Limited number of events per day
                  moreLinkClick: 'popover', // Show more events in a popover
                  fixedWeekCount: false, // Allow variable number of weeks
                  showNonCurrentDates: true, // Show dates from adjacent months
                  eventDisplay: 'auto' // Let FullCalendar decide the best display mode
                }
              }}
              slotDuration="00:30:00"
              allDaySlot={false}
              locale="sv"
              editable={true}
              droppable={true}
              eventDurationEditable={true}
              eventResourceEditable={true}
              eventContent={(args) => {
                // Get event type for proper color coding
                const eventType = args.event.extendedProps.eventType;
                const bookingNumber = args.event.extendedProps.bookingNumber || '';
                const customer = args.event.extendedProps.customer || '';
                
                // Different rendering for month view vs other views
                if (args.view.type === 'dayGridMonth') {
                  return (
                    <div className={`text-xs p-1 overflow-hidden text-ellipsis whitespace-nowrap ${eventType ? `event-${eventType.toLowerCase()}` : ''}`}>
                      {bookingNumber && customer ? (
                        <div className="font-bold">{bookingNumber}: {customer}</div>
                      ) : (
                        <div className="font-bold">{args.event.title}</div>
                      )}
                    </div>
                  );
                }
                
                // Default rendering for other views
                return (
                  <div className={`text-xs p-1 ${eventType ? `event-${eventType.toLowerCase()}` : ''}`}>
                    {bookingNumber && customer ? (
                      <div className="font-bold">{bookingNumber}: {customer}</div>
                    ) : (
                      <div className="font-bold">{args.event.title}</div>
                    )}
                    <div>{args.timeText}</div>
                  </div>
                );
              }}
              eventClick={handleEventClick}
              eventResize={(info) => {
                handleEventChange(info);
              }}
              eventDragStop={(info) => {
                console.log('Drag stopped:', info.event.title);
              }}
              eventDragStart={(info) => {
                console.log('Drag started:', info.event.title);
              }}
              eventDrop={handleEventChange}
              datesSet={handleDatesSet}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ResourceView;
