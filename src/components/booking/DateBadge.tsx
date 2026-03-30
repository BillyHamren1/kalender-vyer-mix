
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { EditDateDialog } from './EditDateDialog';

interface DateBadgeProps {
  date: string;
  eventType: 'rig' | 'event' | 'rigDown';
  canDelete?: boolean;
  onRemoveDate: (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => void;
  onEditDate?: (oldDate: string, newDate: string, startTime: string, endTime: string, eventType: 'rig' | 'event' | 'rigDown') => void;
  autoSync: boolean;
  isOnlyDate?: boolean;
  startTime?: string;
  endTime?: string;
}

export const DateBadge = ({ 
  date, 
  eventType,
  canDelete = true,
  onRemoveDate,
  onEditDate,
  autoSync,
  isOnlyDate = false,
  startTime = '',
  endTime = ''
}: DateBadgeProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Ej schemalagd';
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    // Extract HH:MM from ISO string or raw time
    if (time.includes('T')) {
      return time.substring(11, 16);
    }
    return time.substring(0, 5);
  };

  const displayStartTime = formatTime(startTime);
  const displayEndTime = formatTime(endTime);
  const hasTime = displayStartTime || displayEndTime;

  const handleClick = () => {
    if (onEditDate) {
      setEditOpen(true);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOnlyDate || !canDelete) return;
    setDialogOpen(true);
  };
  
  const handleConfirmRemove = () => {
    onRemoveDate(date, eventType, autoSync);
    setDialogOpen(false);
  };

  const handleEditSave = (oldDate: string, newDate: string, start: string, end: string, type: 'rig' | 'event' | 'rigDown') => {
    if (onEditDate) {
      onEditDate(oldDate, newDate, start, end, type);
    }
  };
  
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
        className="px-2 py-1 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 flex flex-col items-start gap-0"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title="Klicka för att redigera, dubbelklicka för att ta bort"
      >
        <span>{formatDate(date)}</span>
        {hasTime && (
          <span className="text-[10px] opacity-80">
            {displayStartTime}–{displayEndTime}
          </span>
        )}
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

      <EditDateDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        date={date}
        startTime={displayStartTime}
        endTime={displayEndTime}
        eventType={eventType}
        onSave={handleEditSave}
      />
    </>
  );
};
