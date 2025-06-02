
export interface StaffSelectionDialogProps {
  resourceId: string;
  resourceTitle: string;
  currentDate: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaffAssigned: (staffId: string, staffName: string) => Promise<void>;
  availableStaff?: Array<{id: string, name: string, color?: string}>;
}
