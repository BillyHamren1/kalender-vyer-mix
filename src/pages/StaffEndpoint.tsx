
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

// Define types for the API response
interface StaffAssignmentResponse {
  staffId: string;
  date: string;
  teamId: string | null;
  teamName: string | null;
  bookings: Array<{
    id: string;
    client: string;
    bookingNumber?: string;
    deliveryAddress?: string;
    coordinates?: {
      latitude?: number | null;
      longitude?: number | null;
    };
    events: Array<{
      id: string;
      type: string;
      start: string;
      end: string;
      title: string;
    }>;
    products?: Array<{
      id: string;
      name: string;
      quantity: number;
      notes?: string;
    }>;
    internalNotes?: string;
  }>;
  summary?: {
    totalBookings: number;
    eventsByType: {
      rig: number;
      event: number;
      rigDown: number;
    };
  };
}

// Function to fetch staff assignment using export-bookings function
const fetchStaffAssignment = async (staffId: string, date: Date): Promise<StaffAssignmentResponse> => {
  const dateString = date.toISOString().split('T')[0];
  
  try {
    // Call the export-bookings function to get all bookings for the date
    const { data, error } = await supabase.functions.invoke('export-bookings', {
      body: { 
        startDate: dateString,
        endDate: dateString 
      }
    });

    if (error) {
      console.error('Error calling export-bookings function:', error);
      throw error;
    }

    // Filter bookings that have the specific staff member assigned
    const staffBookings = (data?.bookings || []).filter((booking: any) => {
      const hasStaffInRig = booking.rigStaff?.some((staff: any) => staff.staff.id === staffId);
      const hasStaffInEvent = booking.eventStaff?.some((staff: any) => staff.staff.id === staffId);
      const hasStaffInRigDown = booking.rigDownStaff?.some((staff: any) => staff.staff.id === staffId);
      
      return hasStaffInRig || hasStaffInEvent || hasStaffInRigDown;
    });

    // Transform the data to match the expected format
    const transformedBookings = staffBookings.map((booking: any) => {
      // Create events from the booking dates
      const events = [];
      
      if (booking.rigdaydate === dateString) {
        events.push({
          id: `rig-${booking.id}`,
          type: 'rig',
          start: `${booking.rigdaydate}T08:00:00`,
          end: `${booking.rigdaydate}T12:00:00`,
          title: 'Rig Setup'
        });
      }
      
      if (booking.eventdate === dateString) {
        events.push({
          id: `event-${booking.id}`,
          type: 'event',
          start: `${booking.eventdate}T10:00:00`,
          end: `${booking.eventdate}T18:00:00`,
          title: 'Event'
        });
      }
      
      if (booking.rigdowndate === dateString) {
        events.push({
          id: `rigdown-${booking.id}`,
          type: 'rigDown',
          start: `${booking.rigdowndate}T19:00:00`,
          end: `${booking.rigdowndate}T23:00:00`,
          title: 'Rig Down'
        });
      }

      return {
        id: booking.id,
        client: booking.client,
        bookingNumber: booking.bookingNumber,
        deliveryAddress: booking.deliveryaddress,
        coordinates: {
          latitude: booking.deliveryLatitude,
          longitude: booking.deliveryLongitude
        },
        events,
        products: booking.products || [],
        internalNotes: booking.internalnotes
      };
    });

    // Get team ID from first booking's staff assignment
    const firstBooking = staffBookings[0];
    let teamId = null;
    let teamName = null;
    
    if (firstBooking) {
      const staffAssignment = 
        firstBooking.rigStaff?.find((staff: any) => staff.staff.id === staffId) ||
        firstBooking.eventStaff?.find((staff: any) => staff.staff.id === staffId) ||
        firstBooking.rigDownStaff?.find((staff: any) => staff.staff.id === staffId);
      
      if (staffAssignment) {
        teamId = staffAssignment.team_id;
        teamName = `Team-${teamId}`;
      }
    }

    // Calculate summary
    const allEvents = transformedBookings.flatMap(b => b.events);
    const eventsByType = {
      rig: allEvents.filter(e => e.type === 'rig').length,
      event: allEvents.filter(e => e.type === 'event').length,
      rigDown: allEvents.filter(e => e.type === 'rigDown').length
    };

    return {
      staffId,
      date: dateString,
      teamId,
      teamName,
      bookings: transformedBookings,
      summary: {
        totalBookings: transformedBookings.length,
        eventsByType
      }
    };
  } catch (error) {
    console.error('Error fetching staff assignment:', error);
    throw error;
  }
};

const StaffEndpoint = () => {
  const { staffId } = useParams<{ staffId: string }>();
  const [assignmentData, setAssignmentData] = useState<StaffAssignmentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    if (!staffId) return;

    const loadAssignments = async () => {
      try {
        setIsLoading(true);
        const data = await fetchStaffAssignment(staffId, selectedDate);
        setAssignmentData(data);
        console.log("Staff assignment data:", data);
      } catch (error) {
        console.error("Error loading staff assignment:", error);
        toast.error("Could not load assignments");
      } finally {
        setIsLoading(false);
      }
    };

    loadAssignments();
  }, [staffId, selectedDate]);

  const changeDate = (daysToAdd: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + daysToAdd);
    setSelectedDate(newDate);
  };

  // Format coordinates for display
  const formatCoordinates = (lat?: number | null, lng?: number | null) => {
    if (lat === undefined || lat === null || lng === undefined || lng === null) {
      return "No coordinates available";
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  if (!staffId) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Staff ID Required</h1>
        <p>Please provide a staff ID to view assignments.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Staff Assignments</h1>
      
      <div className="flex justify-between items-center mb-6">
        <Button onClick={() => changeDate(-1)}>Previous Day</Button>
        <div className="text-lg font-medium">
          {selectedDate.toLocaleDateString()}
        </div>
        <Button onClick={() => changeDate(1)}>Next Day</Button>
      </div>

      {isLoading ? (
        <div className="text-center p-8">Loading assignments...</div>
      ) : assignmentData && assignmentData.teamId ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Assignment</CardTitle>
              <CardDescription>
                You are assigned to {assignmentData.teamName || assignmentData.teamId} on {assignmentData.date}
              </CardDescription>
            </CardHeader>
            
            {assignmentData.summary && (
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-sm text-gray-500">Total Bookings</div>
                    <div className="font-medium">{assignmentData.summary.totalBookings}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-sm text-gray-500">Rig Events</div>
                    <div className="font-medium">{assignmentData.summary.eventsByType.rig}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-sm text-gray-500">Main Events</div>
                    <div className="font-medium">{assignmentData.summary.eventsByType.event}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-sm text-gray-500">Rig Down Events</div>
                    <div className="font-medium">{assignmentData.summary.eventsByType.rigDown}</div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          <h2 className="text-xl font-semibold mt-6 mb-4">
            Bookings ({assignmentData.bookings.length})
          </h2>

          {assignmentData.bookings.map((booking) => (
            <Card key={booking.id} className="mb-4">
              <CardHeader>
                <CardTitle>{booking.client}</CardTitle>
                <CardDescription>Booking #{booking.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium">Schedule</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                      {booking.events.map((event) => (
                        <div 
                          key={event.id} 
                          className={`p-2 rounded ${
                            event.type === 'rig' 
                              ? 'bg-green-100' 
                              : event.type === 'event' 
                                ? 'bg-yellow-100' 
                                : 'bg-orange-100'
                          }`}
                        >
                          <div className="font-medium capitalize">{event.type}</div>
                          <div className="text-sm">
                            {new Date(event.start).toLocaleTimeString()} - 
                            {new Date(event.end).toLocaleTimeString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {booking.deliveryAddress && (
                    <div className="space-y-1">
                      <h3 className="font-medium">Delivery Address</h3>
                      <p className="text-gray-600">{booking.deliveryAddress}</p>
                      
                      {booking.coordinates && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="flex items-center gap-1 bg-blue-50">
                            <MapPin className="h-3 w-3" />
                            <span className="text-xs">
                              {formatCoordinates(
                                booking.coordinates.latitude, 
                                booking.coordinates.longitude
                              )}
                            </span>
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}

                  {booking.products && booking.products.length > 0 && (
                    <div>
                      <h3 className="font-medium">Products</h3>
                      <ul className="list-disc list-inside text-gray-600">
                        {booking.products.map((product) => (
                          <li key={product.id}>
                            {product.name} (x{product.quantity})
                            {product.notes && <span className="text-gray-500"> - {product.notes}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {booking.internalNotes && (
                    <div>
                      <h3 className="font-medium">Notes</h3>
                      <p className="text-gray-600">{booking.internalNotes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" className="w-full">View Full Details</Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No Assignments</CardTitle>
            <CardDescription>
              You don't have any assignments for {selectedDate.toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Check another date or contact your manager for more information.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StaffEndpoint;
