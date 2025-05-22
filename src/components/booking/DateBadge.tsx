
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import ConfirmationDialog from '@/components/ConfirmationDialog';

interface DateBadgeProps {
  date: string;
  eventType: 'rig' | 'event' | 'rigDown';
  canDelete?: boolean;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  autoSync: boolean;
}

export const DateBadge = ({ 
  date, 
  eventType,
  canDelete = true,
  onRemoveDate,
  autoSync
}: DateBadgeProps) => {
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleDateString();
  };

  const handleRemoveDate = () => {
    console.log(`Removing date ${date} of type ${eventType} with autoSync=${autoSync}`);
    onRemoveDate(date, eventType, autoSync);
  };

  return (
    <div className="flex items-center gap-1 mb-1">
      <Badge variant="secondary" className="px-2 py-1">
        {formatDate(date)}
      </Badge>
      
      {canDelete && (
        <ConfirmationDialog
          title="Remove date?"
          description="Are you sure you want to remove this date? This action will also remove the associated calendar event."
          confirmLabel="Remove"
          onConfirm={handleRemoveDate}
        >
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
            <X className="h-3 w-3" />
          </Button>
        </ConfirmationDialog>
      )}
    </div>
  );
};
