import React, { useState } from 'react';
import { Calendar, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar asshadCalendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';

const TestMonthlyView = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <div className="flex flex-col h-screen">
      <div className="bg-gray-100 py-4 px-6 border-b border-gray-300">
        <h1 className="text-2xl font-semibold">Test Monthly View</h1>
      </div>

      <div className="flex flex-grow overflow-auto">
        <div className="w-64 p-4 border-r border-gray-300">
          <Card>
            <CardHeader>
              <CardTitle>Calendar</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={'outline'}
                    className={cn(
                      'w-[240px] justify-start text-left font-normal',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <DayPicker
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    footer={
                      date ? (
                        <p>
                          You picked{' '}
                          {format(date, 'PPP')}
                          .
                        </p>
                      ) : (
                        <p>Please pick a date.</p>
                      )
                    }
                  />
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 p-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Content</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                This is where the main monthly content would go.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Available Staff Panel - add required props */}
        <AvailableStaffDisplay
          currentDate={date}
          onStaffDrop={async () => {}}
          availableStaff={[]}
          isLoading={false}
        />
      </div>
    </div>
  );
};

export default TestMonthlyView;
