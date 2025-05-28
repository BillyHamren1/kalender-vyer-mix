
import React from 'react';
import { Check, Users, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StaffResource } from '@/services/staffCalendarService';
import { cn } from '@/lib/utils';

interface StaffSelectorPanelProps {
  staffResources: StaffResource[];
  selectedStaffIds: string[];
  onSelectionChange: (staffIds: string[]) => void;
  isLoading?: boolean;
}

const StaffSelectorPanel: React.FC<StaffSelectorPanelProps> = ({
  staffResources,
  selectedStaffIds,
  onSelectionChange,
  isLoading = false
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');

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
    if (staffResources.length === 0) return;
    onSelectionChange(staffResources.map(staff => staff.id));
  };

  const handleSelectNone = () => {
    onSelectionChange([]);
  };

  // Filter staff based on search term
  const filteredStaff = staffResources.filter(staff =>
    staff.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Staff Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Staff Members ({staffResources.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search staff members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Select All/None Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="flex-1 text-xs"
            disabled={selectedStaffIds.length === staffResources.length}
          >
            <Check
              className={cn(
                "mr-1 h-3 w-3",
                selectedStaffIds.length === staffResources.length ? "opacity-100" : "opacity-0"
              )}
            />
            Select All ({staffResources.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectNone}
            className="flex-1 text-xs"
            disabled={selectedStaffIds.length === 0}
          >
            <Check
              className={cn(
                "mr-1 h-3 w-3",
                selectedStaffIds.length === 0 ? "opacity-100" : "opacity-0"
              )}
            />
            Select None
          </Button>
        </div>

        {/* Staff List */}
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {filteredStaff.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">
              {searchTerm ? 'No staff members found.' : 'No staff members available.'}
            </div>
          ) : (
            filteredStaff.map((staff) => (
              <div
                key={staff.id}
                className={cn(
                  "flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors hover:bg-gray-50",
                  selectedStaffIds.includes(staff.id) ? "bg-blue-50 border border-blue-200" : "border border-transparent"
                )}
                onClick={() => handleStaffToggle(staff.id)}
              >
                <div className="flex items-center justify-center w-4 h-4">
                  <Check
                    className={cn(
                      "h-3 w-3 text-blue-600",
                      selectedStaffIds.includes(staff.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                </div>
                <span className="text-sm font-medium flex-1">{staff.name}</span>
              </div>
            ))
          )}
        </div>

        {/* Selection Summary */}
        <div className="pt-2 border-t text-xs text-gray-600">
          {selectedStaffIds.length === 0 && 'No staff selected'}
          {selectedStaffIds.length === 1 && '1 staff member selected'}
          {selectedStaffIds.length > 1 && `${selectedStaffIds.length} staff members selected`}
        </div>
      </CardContent>
    </Card>
  );
};

export default StaffSelectorPanel;
