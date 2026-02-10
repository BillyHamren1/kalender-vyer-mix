
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import ConfirmationDialog from '@/components/ConfirmationDialog';

interface DateBadgeProps {
  date: string;
  eventType: 'rig' | 'event' | 'rigDown';
  canDelete?: boolean;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  autoSync: boolean;
  isOnlyDate?: boolean;
}

export const DateBadge = ({ 
  date, 
  eventType,
  canDelete = true,
  onRemoveDate,
  autoSync,
  isOnlyDate = false
}: DateBadgeProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleDateString();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't open dialog if this is the only date of its type or can't be deleted
    if (isOnlyDate || !canDelete) return;
    
    setDialogOpen(true);
  };
  
  const handleConfirmRemove = () => {
    onRemoveDate(date, eventType, autoSync);
    setDialogOpen(false);
  };
  
  // Map event type to readable name for dialog
  const getEventTypeName = () => {
    switch (eventType) {
      case 'rig': return 'rig day';
      case 'event': return 'event date';
      case 'rigDown': return 'rig down day';
      default: return 'date';
    }
  };

  return (
    <>
      <Badge 
        className={`px-2 py-1 cursor-pointer bg-primary text-primary-foreground ${isOnlyDate ? 'cursor-default' : 'hover:bg-primary/90'}`}
        onDoubleClick={handleDoubleClick}
        title={isOnlyDate ? "Cannot remove the only " + getEventTypeName() : "Double-click to remove"}
      >
        {formatDate(date)}
      </Badge>
      
      <ConfirmationDialog
        title={`Remove ${getEventTypeName()}?`}
        description={`Are you sure you want to remove ${formatDate(date)}? This action will also remove the associated calendar event.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRemove}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <span style={{ display: 'none' }}></span>
      </ConfirmationDialog>
    </>
  );
};
