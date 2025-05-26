
import React, { useState, useEffect } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { getStaffResources, StaffResource } from '@/services/staffCalendarService';
import { toast } from 'sonner';

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
  const [staffResources, setStaffResources] = useState<StaffResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStaffResources = async () => {
      try {
        setIsLoading(true);
        const resources = await getStaffResources();
        setStaffResources(resources);
      } catch (error) {
        console.error('Error loading staff resources:', error);
        toast.error('Failed to load staff members');
      } finally {
        setIsLoading(false);
      }
    };

    loadStaffResources();
  }, []);

  const handleStaffToggle = (staffId: string) => {
    const updatedSelection = selectedStaffIds.includes(staffId)
      ? selectedStaffIds.filter(id => id !== staffId)
      : [...selectedStaffIds, staffId];
    
    onSelectionChange(updatedSelection);
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
    return <div className="text-sm text-gray-500">Loading staff...</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[300px] justify-between"
            disabled={disabled}
          >
            {selectedStaffIds.length === 0
              ? "Select staff members..."
              : `${selectedStaffIds.length} staff selected`}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Search staff..." />
            <CommandEmpty>No staff found.</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={handleSelectAll}>
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedStaffIds.length === staffResources.length
                      ? "opacity-100"
                      : "opacity-0"
                  )}
                />
                Select All ({staffResources.length})
              </CommandItem>
              {staffResources.map((staff) => (
                <CommandItem
                  key={staff.id}
                  onSelect={() => handleStaffToggle(staff.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedStaffIds.includes(staff.id)
                        ? "opacity-100"
                        : "opacity-0"
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
      
      {selectedStaffIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedStaffIds.slice(0, 3).map(staffId => {
            const staff = staffResources.find(s => s.id === staffId);
            return staff ? (
              <Badge key={staffId} variant="secondary" className="text-xs">
                {staff.name}
              </Badge>
            ) : null;
          })}
          {selectedStaffIds.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{selectedStaffIds.length - 3} more
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};

export default StaffSelector;
