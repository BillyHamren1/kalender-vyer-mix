
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { clearAndRefreshCalendar } from '@/services/calendarClearService';

interface ClearCalendarButtonProps {
  onRefresh?: () => Promise<void>;
}

const ClearCalendarButton: React.FC<ClearCalendarButtonProps> = ({ onRefresh }) => {
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCalendar = async () => {
    if (!window.confirm('Are you sure you want to clear ALL calendar events AND staff assignments? This action cannot be undone.')) {
      return;
    }

    setIsClearing(true);
    try {
      await clearAndRefreshCalendar(onRefresh);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Button
      onClick={handleClearCalendar}
      disabled={isClearing}
      variant="destructive"
      size="sm"
      className="gap-2"
    >
      <Trash2 className="h-4 w-4" />
      {isClearing ? 'Clearing...' : 'Clear All Data'}
    </Button>
  );
};

export default ClearCalendarButton;
