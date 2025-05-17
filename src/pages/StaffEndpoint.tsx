
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fetchStaffAssignment, StaffAssignmentResponse } from "@/services/staffAssignmentService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

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
                You are assigned to {assignmentData.teamId} on {assignmentData.date}
              </CardDescription>
            </CardHeader>
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
                    <div>
                      <h3 className="font-medium">Delivery Address</h3>
                      <p className="text-gray-600">{booking.deliveryAddress}</p>
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
