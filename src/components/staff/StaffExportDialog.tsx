
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { unifiedStaffService } from '@/services/unifiedStaffService';
import { toast } from 'sonner';

interface StaffExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  staffMembers: Array<{
    id: string;
    name: string;
    email?: string;
  }>;
}

const StaffExportDialog: React.FC<StaffExportDialogProps> = ({
  isOpen,
  onClose,
  staffMembers
}) => {
  const [externalUrl, setExternalUrl] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);

  const handleStaffSelection = (staffId: string, checked: boolean) => {
    if (checked) {
      setSelectedStaffIds([...selectedStaffIds, staffId]);
    } else {
      setSelectedStaffIds(selectedStaffIds.filter(id => id !== staffId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStaffIds(staffMembers.map(staff => staff.id));
    } else {
      setSelectedStaffIds([]);
    }
  };

  const handleExport = async () => {
    if (!externalUrl) {
      toast.error('Please enter external system URL');
      return;
    }

    if (selectedStaffIds.length === 0) {
      toast.error('Please select at least one staff member');
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      const result = await unifiedStaffService.exportSelectedStaff(externalUrl, selectedStaffIds);
      
      setExportResult(result);
      
      if (result.success) {
        toast.success(`Successfully exported ${result.data?.exported_count || 0} staff members`);
      } else {
        toast.error(`Export failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed: Network error');
      setExportResult({
        success: false,
        error: 'Network error occurred'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setExternalUrl('');
    setSelectedStaffIds([]);
    setExportResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Staff to External System
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* External URL Input */}
          <div className="space-y-2">
            <Label htmlFor="external-url">External System URL</Label>
            <Input
              id="external-url"
              type="url"
              placeholder="https://your-external-system.com/api/staff/import"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              disabled={isExporting}
            />
            <p className="text-sm text-gray-600">
              Staff data will be sent as JSON with UUID, name, email, and password hash
            </p>
          </div>

          {/* Staff Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Select Staff Members to Export</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all"
                  checked={selectedStaffIds.length === staffMembers.length}
                  onCheckedChange={handleSelectAll}
                  disabled={isExporting}
                />
                <Label htmlFor="select-all" className="text-sm">
                  Select All ({staffMembers.length})
                </Label>
              </div>
            </div>

            <ScrollArea className="h-48 border rounded-md p-3">
              <div className="space-y-2">
                {staffMembers.map((staff) => (
                  <div key={staff.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                    <Checkbox
                      id={`staff-${staff.id}`}
                      checked={selectedStaffIds.includes(staff.id)}
                      onCheckedChange={(checked) => handleStaffSelection(staff.id, checked)}
                      disabled={isExporting}
                    />
                    <Label htmlFor={`staff-${staff.id}`} className="flex-1 cursor-pointer">
                      <div>
                        <div className="font-medium">{staff.name}</div>
                        {staff.email && (
                          <div className="text-sm text-gray-600">{staff.email}</div>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="text-sm text-gray-600">
              Selected: {selectedStaffIds.length} of {staffMembers.length} staff members
            </div>
          </div>

          {/* Export Result */}
          {exportResult && (
            <div className="p-4 border rounded-md">
              <div className="flex items-center gap-2 mb-2">
                {exportResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className="font-medium">
                  {exportResult.success ? 'Export Successful' : 'Export Failed'}
                </span>
              </div>
              
              {exportResult.success ? (
                <div className="space-y-2">
                  <Badge variant="outline" className="text-green-700">
                    {exportResult.data?.exported_count || 0} staff members exported
                  </Badge>
                  {exportResult.data?.exported_staff_ids && (
                    <div className="text-sm text-gray-600">
                      Exported IDs: {exportResult.data.exported_staff_ids.slice(0, 3).join(', ')}
                      {exportResult.data.exported_staff_ids.length > 3 && '...'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-red-600">
                  {exportResult.error}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose} disabled={isExporting}>
              {exportResult?.success ? 'Close' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleExport} 
              disabled={isExporting || !externalUrl || selectedStaffIds.length === 0}
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Staff
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StaffExportDialog;
