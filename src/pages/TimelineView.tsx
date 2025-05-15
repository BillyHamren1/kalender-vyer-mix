
import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import { sampleResources, sampleEvents } from '../components/Calendar/ResourceData';

const TimelineView = () => {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Tidslinjvy</h1>
        <div className="bg-white rounded-lg shadow-md p-4">
          {isMounted && (
            <FullCalendar
              plugins={[resourceTimelinePlugin]}
              initialView="resourceTimeline"
              resources={sampleResources}
              events={sampleEvents}
              height="auto"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'resourceTimelineDay,resourceTimelineWeek,resourceTimelineMonth'
              }}
              slotDuration="01:00:00"
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

export default TimelineView;
