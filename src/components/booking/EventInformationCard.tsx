
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          <span>Event Information</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Event Type</label>
            <p className="text-sm text-gray-600 mt-1">Corporate Event</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Event Dates</label>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Rig Up</div>
                {rigDates.length > 0 ? (
                  <div className="text-sm font-medium bg-green-100 border border-green-200 px-2 py-1 rounded text-black">
                    {new Date(rigDates[0]).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Not set</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Event</div>
                {eventDates.length > 0 ? (
                  <div className="text-sm font-medium bg-yellow-100 border border-yellow-200 px-2 py-1 rounded text-black">
                    {new Date(eventDates[0]).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Not set</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-1">Rig Down</div>
                {rigDownDates.length > 0 ? (
                  <div className="text-sm font-medium bg-red-100 border border-red-200 px-2 py-1 rounded text-black">
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
