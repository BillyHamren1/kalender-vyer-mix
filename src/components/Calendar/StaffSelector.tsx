
import React, { useState, useEffect } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { getStaffResources, StaffResource } from '@/services/staffCalendarService';
import { cn } from '@/lib/utils';

interface StaffSelectorProps {
  selectedStaffIds: string[];
  onSelectionChange: (staffIds: string[]) => void;
  disabled?: boolean;
}

const StaffSelector: React.FC<StaffSelectorProps> = ({
  selectedStaffIds,
  onSelectionChange,
  disabled = false
}) => {
  const [open, setOpen] = useState(false);

  // Fetch staff resources with proper error handling
  const { 
    data: staffResources = [], 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
  });

  // Ensure we always have a valid array
  const safeStaffResources = Array.isArray(staffResources) ? staffResources : [];

  const handleStaffToggle = (staffId: string) => {
    const currentSelection = selectedStaffIds || [];
    
    if (currentSelection.includes(staffId)) {
      // Remove staff member
      onSelectionChange(currentSelection.filter(id => id !== staffId));
    } else {
      // Add staff member
      onSelectionChange([...currentSelection, staffId]);
    }
  };

  const handleSelectAll = () => {
    if (safeStaffResources.length === 0) return;
    
    onSelectionChange(safeStaffResources.map(staff => staff.id));
  };

  const handleSelectNone = () => {
    onSelectionChange([]);
  };

  const getButtonText = () => {
    if (isLoading) return 'Loading staff...';
    if (error) return 'Error loading staff';
    if (!selectedStaffIds || selectedStaffIds.length === 0) return 'Select staff members';
    if (selectedStaffIds.length === safeStaffResources.length) return 'All staff selected';
    if (selectedStaffIds.length === 1) {
      const selectedStaff = safeStaffResources.find(staff => staff.id === selectedStaffIds[0]);
      return selectedStaff ? selectedStaff.name : '1 staff member';
    }
    return `${selectedStaffIds.length} staff members`;
  };

  // Don't render the selector if there's an error or no data
  if (error) {
    return (
      <div className="flex items-center text-red-600 text-sm">
        <Users className="h-4 w-4 mr-2" />
        Error loading staff
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[280px] justify-between"
          disabled={disabled || isLoading}
        >
          <Users className="h-4 w-4 mr-2" />
          {getButtonText()}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search staff members..." />
          <CommandList>
            <CommandEmpty>
              {isLoading ? 'Loading...' : 'No staff members found.'}
            </CommandEmpty>
            {!isLoading && safeStaffResources.length > 0 && (
              <CommandGroup>
                <CommandItem onSelect={handleSelectAll}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedStaffIds.length === safeStaffResources.length ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Select All ({safeStaffResources.length})
                </CommandItem>
                <CommandItem onSelect={handleSelectNone}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedStaffIds.length === 0 ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Select None
                </CommandItem>
                {safeStaffResources.map((staff) => (
                  <CommandItem
                    key={staff.id}
                    value={staff.name}
                    onSelect={() => handleStaffToggle(staff.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedStaffIds.includes(staff.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {staff.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default StaffSelector;
