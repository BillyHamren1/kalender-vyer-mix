
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
    if (!dateString) return 'Ej schemalagd';
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
      case 'rig': return 'riggdag';
      case 'event': return 'eventdatum';
      case 'rigDown': return 'nedriggdag';
      default: return 'datum';
    }
  };

  return (
    <>
      <Badge 
        className={`px-2 py-1 cursor-pointer bg-primary text-primary-foreground ${isOnlyDate ? 'cursor-default' : 'hover:bg-primary/90'}`}
        onDoubleClick={handleDoubleClick}
        title={isOnlyDate ? "Kan inte ta bort enda " + getEventTypeName() : "Dubbelklicka för att ta bort"}
      >
        {formatDate(date)}
      </Badge>
      
        <ConfirmationDialog
        title={`Ta bort ${getEventTypeName()}?`}
        description={`Är du säker på att du vill ta bort ${formatDate(date)}? Detta tar även bort den associerade kalenderhändelsen.`}
        confirmLabel="Ta bort"
        cancelLabel="Avbryt"
        onConfirm={handleConfirmRemove}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <span style={{ display: 'none' }}></span>
      </ConfirmationDialog>
    </>
  );
};
