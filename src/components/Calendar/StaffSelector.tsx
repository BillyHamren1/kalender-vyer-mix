
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
import { getAvailableStaffForDate } from '@/services/staffAvailabilityService';
import { cn } from '@/lib/utils';

interface StaffSelectorProps {
  selectedStaffIds: string[];
  onSelectionChange: (staffIds: string[]) => void;
  disabled?: boolean;
  filterByDate?: Date; // Optional: filter staff by availability for specific date
}

const StaffSelector: React.FC<StaffSelectorProps> = ({
  selectedStaffIds,
  onSelectionChange,
  disabled = false,
  filterByDate
}) => {
  const [open, setOpen] = useState(false);
  const [availableStaffIds, setAvailableStaffIds] = useState<string[]>([]);

  // Fetch staff resources with proper error handling
  const { 
    data: staffResources = [], 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
  });

  // Fetch available staff for the specific date if filterByDate is provided
  useEffect(() => {
    if (filterByDate) {
      getAvailableStaffForDate(filterByDate)
        .then(ids => setAvailableStaffIds(ids))
        .catch(err => {
          console.error('Error fetching available staff:', err);
          setAvailableStaffIds([]);
        });
    } else {
      // If no date filter, all active staff are available
      setAvailableStaffIds([]);
    }
  }, [filterByDate]);

  // Filter staff based on availability
  const safeStaffResources = Array.isArray(staffResources) ? staffResources : [];
  const filteredStaffResources = filterByDate && availableStaffIds.length > 0
    ? safeStaffResources.filter(staff => availableStaffIds.includes(staff.id))
    : safeStaffResources;

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
    if (filteredStaffResources.length === 0) return;
    
    onSelectionChange(filteredStaffResources.map(staff => staff.id));
  };

  const handleSelectNone = () => {
    onSelectionChange([]);
  };

  const getButtonText = () => {
    if (isLoading) return 'Laddar personal...';
    if (error) return 'Error loading staff';
    if (filterByDate && availableStaffIds.length === 0) return 'Ingen tillgänglig personal';
    if (!selectedStaffIds || selectedStaffIds.length === 0) return 'Välj personal';
    if (selectedStaffIds.length === filteredStaffResources.length) return 'All personal vald';
    if (selectedStaffIds.length === 1) {
      const selectedStaff = filteredStaffResources.find(staff => staff.id === selectedStaffIds[0]);
      return selectedStaff ? selectedStaff.name : '1 person vald';
    }
    return `${selectedStaffIds.length} personer valda`;
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
              {isLoading ? 'Laddar...' : filterByDate && availableStaffIds.length === 0 ? 'Ingen personal tillgänglig för detta datum' : 'Ingen personal hittades'}
            </CommandEmpty>
            {!isLoading && filteredStaffResources.length > 0 && (
              <CommandGroup>
                <CommandItem onSelect={handleSelectAll}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedStaffIds.length === filteredStaffResources.length ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Välj alla ({filteredStaffResources.length})
                </CommandItem>
                <CommandItem onSelect={handleSelectNone}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedStaffIds.length === 0 ? "opacity-100" : "opacity-0"
                    )}
                  />
                  Avmarkera alla
                </CommandItem>
                {filteredStaffResources.map((staff) => (
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
