
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
  CommandList,
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
  selectedStaffIds = [], // Ensure default value
  onSelectionChange,
}) => {
  const [open, setOpen] = useState(false);

  const { data: staffResources, isLoading, error } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Ensure we always have a valid array to work with
  const safeStaffResources = Array.isArray(staffResources) ? staffResources : [];
  const safeSelectedStaffIds = Array.isArray(selectedStaffIds) ? selectedStaffIds : [];

  const handleStaffToggle = (staffId: string) => {
    if (!onSelectionChange || !staffId) return;
    
    const newSelection = safeSelectedStaffIds.includes(staffId)
      ? safeSelectedStaffIds.filter(id => id !== staffId)
      : [...safeSelectedStaffIds, staffId];
    
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    if (!onSelectionChange || safeStaffResources.length === 0) return;
    
    if (safeSelectedStaffIds.length === safeStaffResources.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(safeStaffResources.map(staff => staff?.id).filter(Boolean));
    }
  };

  if (isLoading) {
    return (
      <Button variant="outline" disabled>
        <Users className="h-4 w-4 mr-2" />
        Loading staff...
      </Button>
    );
  }

  if (error) {
    return (
      <Button variant="outline" disabled>
        <Users className="h-4 w-4 mr-2" />
        Error loading staff
      </Button>
    );
  }

  // Don't render the popover if we don't have valid data
  if (safeStaffResources.length === 0) {
    return (
      <Button variant="outline" disabled>
        <Users className="h-4 w-4 mr-2" />
        No staff available
      </Button>
    );
  }

  const getDisplayText = () => {
    if (safeSelectedStaffIds.length === 0) {
      return "Select staff members...";
    } else if (safeSelectedStaffIds.length === 1) {
      const staff = safeStaffResources.find(staff => staff?.id === safeSelectedStaffIds[0]);
      return staff?.name || "Unknown Staff";
    } else {
      return `${safeSelectedStaffIds.length} staff selected`;
    }
  };

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
            {getDisplayText()}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search staff members..." />
          <CommandList>
            <CommandEmpty>No staff members found.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={handleSelectAll}>
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    safeSelectedStaffIds.length === safeStaffResources.length ? "opacity-100" : "opacity-0"
                  )}
                />
                {safeSelectedStaffIds.length === safeStaffResources.length ? "Deselect All" : "Select All"}
              </CommandItem>
              {safeStaffResources.map((staff) => {
                if (!staff || !staff.id) return null;
                
                return (
                  <CommandItem
                    key={staff.id}
                    onSelect={() => handleStaffToggle(staff.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        safeSelectedStaffIds.includes(staff.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{staff.name || 'Unknown Staff'}</span>
                      {staff.email && (
                        <span className="text-xs text-gray-500">{staff.email}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default StaffSelector;
