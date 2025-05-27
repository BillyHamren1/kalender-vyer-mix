
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { getStaffResources } from '@/services/staffCalendarService';
import { cn } from '@/lib/utils';

interface StaffSelectorProps {
  selectedStaffIds: string[];
  onSelectionChange: (staffIds: string[]) => void;
}

const StaffSelector: React.FC<StaffSelectorProps> = ({
  selectedStaffIds,
  onSelectionChange,
}) => {
  const [open, setOpen] = useState(false);

  const { data: staffResources = [], isLoading } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleStaffToggle = (staffId: string) => {
    const newSelection = selectedStaffIds.includes(staffId)
      ? selectedStaffIds.filter(id => id !== staffId)
      : [...selectedStaffIds, staffId];
    
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedStaffIds.length === staffResources.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(staffResources.map(staff => staff.id));
    }
  };

  const getSelectedStaffNames = () => {
    return selectedStaffIds
      .map(id => staffResources.find(staff => staff.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  if (isLoading) {
    return (
      <Button variant="outline" disabled>
        <Users className="h-4 w-4 mr-2" />
        Loading staff...
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[300px] justify-between"
        >
          <div className="flex items-center">
            <Users className="h-4 w-4 mr-2" />
            {selectedStaffIds.length === 0 ? (
              "Select staff members..."
            ) : selectedStaffIds.length === 1 ? (
              staffResources.find(staff => staff.id === selectedStaffIds[0])?.name || "Unknown Staff"
            ) : (
              `${selectedStaffIds.length} staff selected`
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search staff members..." />
          <CommandEmpty>No staff members found.</CommandEmpty>
          <CommandGroup>
            <CommandItem onSelect={handleSelectAll}>
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  selectedStaffIds.length === staffResources.length ? "opacity-100" : "opacity-0"
                )}
              />
              {selectedStaffIds.length === staffResources.length ? "Deselect All" : "Select All"}
            </CommandItem>
            {staffResources.map((staff) => (
              <CommandItem
                key={staff.id}
                onSelect={() => handleStaffToggle(staff.id)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedStaffIds.includes(staff.id) ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span>{staff.name}</span>
                  {staff.email && (
                    <span className="text-xs text-gray-500">{staff.email}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default StaffSelector;
