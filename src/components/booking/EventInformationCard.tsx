
import React from 'react';
import { Calendar } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';

interface EventInformationCardProps {
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
}

export const EventInformationCard = ({ rigDates, eventDates, rigDownDates }: EventInformationCardProps) => {
  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Calendar className="h-4 w-4" />
          <span>Event Information</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-gray-500">Event Type</p>
            <p className="text-sm">Corporate Event</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Event Dates</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-0.5">Rig Up</div>
                {rigDates.length > 0 ? (
                  <div className="text-xs font-medium bg-green-100 border border-green-200 px-1.5 py-0.5 rounded text-black">
                    {new Date(rigDates[0]).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Not set</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-0.5">Event</div>
                {eventDates.length > 0 ? (
                  <div className="text-xs font-medium bg-yellow-100 border border-yellow-200 px-1.5 py-0.5 rounded text-black">
                    {new Date(eventDates[0]).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Not set</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-0.5">Rig Down</div>
                {rigDownDates.length > 0 ? (
                  <div className="text-xs font-medium bg-red-100 border border-red-200 px-1.5 py-0.5 rounded text-black">
                    {new Date(rigDownDates[0]).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Not set</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
