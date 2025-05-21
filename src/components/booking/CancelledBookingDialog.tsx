
import React from 'react';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface CancelledBookingDialogProps {
  bookingId: string;
  clientName: string;
  onConfirm: () => Promise<void>;
}

const CancelledBookingDialog: React.FC<CancelledBookingDialogProps> = ({
  bookingId,
  clientName,
  onConfirm
}) => {
  return (
    <ConfirmationDialog
      title="Delete Cancelled Booking"
      description={
        <div>
          <div className="flex items-center gap-2 mb-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Warning: This action cannot be undone</span>
          </div>
          <p>
            Booking <span className="font-medium">{bookingId}</span> for client{' '}
            <span className="font-medium">{clientName}</span> has been cancelled in the external system.
          </p>
          <p className="mt-2">
            Marking it as viewed will permanently delete this booking and all its related data from the database.
          </p>
        </div>
      }
      confirmLabel="Delete Booking"
      cancelLabel="Keep for Now"
      onConfirm={onConfirm}
    >
      <Button variant="outline" size="sm" className="flex items-center gap-1">
        <span>Mark as Viewed</span>
      </Button>
    </ConfirmationDialog>
  );
};

export default CancelledBookingDialog;
