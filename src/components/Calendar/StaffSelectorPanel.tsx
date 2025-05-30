
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
      <Card className="border-0">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-[#7BAEBF] to-[#6E9DAC] rounded-lg">
              <Users className="h-4 w-4 text-white" />
            </div>
            Staff Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#7BAEBF] border-t-transparent"></div>
              <span className="text-gray-600 font-medium">Loading staff...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-[#7BAEBF] to-[#6E9DAC] rounded-lg">
            <Users className="h-4 w-4 text-white" />
          </div>
          <div>
            <div>Staff Members</div>
            <div className="text-sm font-normal text-gray-500">{staffResources.length} available</div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Modern Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search staff members..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 border-gray-200 focus:border-[#7BAEBF] focus:ring-[#7BAEBF] transition-colors"
          />
        </div>

        {/* Modern Select All/None Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className={cn(
              "text-xs font-medium transition-all duration-200",
              selectedStaffIds.length === staffResources.length 
                ? "bg-[#7BAEBF]/10 border-[#7BAEBF]/30 text-[#6E9DAC] hover:bg-[#7BAEBF]/20" 
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            )}
            disabled={selectedStaffIds.length === staffResources.length}
          >
            <Check
              className={cn(
                "mr-1 h-3 w-3 transition-opacity",
                selectedStaffIds.length === staffResources.length ? "opacity-100" : "opacity-0"
              )}
            />
            All ({staffResources.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectNone}
            className={cn(
              "text-xs font-medium transition-all duration-200",
              selectedStaffIds.length === 0 
                ? "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100" 
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            )}
            disabled={selectedStaffIds.length === 0}
          >
            <Check
              className={cn(
                "mr-1 h-3 w-3 transition-opacity",
                selectedStaffIds.length === 0 ? "opacity-100" : "opacity-0"
              )}
            />
            None
          </Button>
        </div>

        {/* Modern Staff List */}
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {filteredStaff.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <Users className="h-8 w-8 mx-auto" />
              </div>
              <p className="text-sm text-gray-500">
                {searchTerm ? 'No staff members found.' : 'No staff members available.'}
              </p>
            </div>
          ) : (
            filteredStaff.map((staff) => (
              <div
                key={staff.id}
                className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-all duration-200 group",
                  selectedStaffIds.includes(staff.id) 
                    ? "bg-[#7BAEBF]/10 border border-[#7BAEBF]/30 shadow-sm" 
                    : "border border-transparent hover:bg-gray-50 hover:shadow-sm"
                )}
                onClick={() => handleStaffToggle(staff.id)}
              >
                <div className={cn(
                  "flex items-center justify-center w-5 h-5 rounded border-2 transition-all duration-200",
                  selectedStaffIds.includes(staff.id)
                    ? "bg-[#7BAEBF] border-[#7BAEBF]"
                    : "border-gray-300 group-hover:border-gray-400"
                )}>
                  <Check
                    className={cn(
                      "h-3 w-3 text-white transition-opacity duration-200",
                      selectedStaffIds.includes(staff.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{staff.name}</p>
                  {staff.email && (
                    <p className="text-xs text-gray-500 truncate">{staff.email}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modern Selection Summary */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">
              {selectedStaffIds.length === 0 && 'No staff selected'}
              {selectedStaffIds.length === 1 && '1 staff member selected'}
              {selectedStaffIds.length > 1 && `${selectedStaffIds.length} staff members selected`}
            </span>
            {selectedStaffIds.length > 0 && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-xs font-medium text-green-600">Active</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StaffSelectorPanel;
