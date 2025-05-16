import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type DateSelectionStepProps = {
  onClose: () => void;
  onBack: () => void;
};

type BookingDates = {
  rigUp: Date[];
  event: Date[];
  rigDown: Date[];
};

const DateSelectionStep = ({ onClose, onBack }: DateSelectionStepProps) => {
  const [selectedDates, setSelectedDates] = useState<BookingDates>({
    rigUp: [],
    event: [],
    rigDown: [],
  });

  const handleDateSelect = (date: Date | undefined, type: keyof BookingDates) => {
    if (!date) return;

    setSelectedDates(prev => {
      const isSelected = prev[type].some(d =>
        d.getDate() === date.getDate() &&
        d.getMonth() === date.getMonth() &&
        d.getFullYear() === date.getFullYear()
      );

      const newDates = isSelected
        ? prev[type].filter(d =>
            !(d.getDate() === date.getDate() &&
              d.getMonth() === date.getMonth() &&
              d.getFullYear() === date.getFullYear())
          )
        : [...prev[type], date];

      return {
        ...prev,
        [type]: newDates
      };
    });
  };

  const calendarCommonStyles = {
    className: cn("border-0 w-full"),
    classNames: {
      months: "w-full",
      month: "w-full space-y-6",
      table: "w-full border-collapse",
      row: "flex w-full mt-4 justify-between",
      cell: "relative p-0 text-center w-full focus-within:relative focus-within:z-20",
      day: cn(
        "h-12 w-12 p-0 font-normal text-base aria-selected:opacity-100 hover:bg-accent rounded-full mx-auto"
      ),
      day_today: "bg-white border-[3px] border-[#ea384c]"
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Rig Up */}
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Rig Up Dates</div>
            <div className="text-sm text-muted-foreground">Select dates for setting up</div>
          </CardHeader>
          <CardContent>
            <Calendar
              selected={selectedDates.rigUp}
              mode="multiple"
              onSelect={(date) => handleDateSelect(date, "rigUp")}
              {...calendarCommonStyles}
            />
          </CardContent>
        </Card>

        {/* Event */}
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Event Dates</div>
            <div className="text-sm text-muted-foreground">Select dates for the event</div>
          </CardHeader>
          <CardContent>
            <Calendar
              selected={selectedDates.event}
              mode="multiple"
              onSelect={(date) => handleDateSelect(date, "event")}
              {...calendarCommonStyles}
            />
          </CardContent>
        </Card>

        {/* Rig Down */}
        <Card>
          <CardHeader>
            <div className="text-lg font-semibold">Rig Down Dates</div>
            <div className="text-sm text-muted-foreground">Select dates for teardown</div>
          </CardHeader>
          <CardContent>
            <Calendar
              selected={selectedDates.rigDown}
              mode="multiple"
              onSelect={(date) => handleDateSelect(date, "rigDown")}
              {...calendarCommonStyles}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default DateSelectionStep;
