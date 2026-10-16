import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openOperationsBrain, shouldShowBrainButton } from '@/lib/operationsBrain';

export const BrainFloatingButton: React.FC = () => {
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  if (!shouldShowBrainButton()) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      await openOperationsBrain({ view: location.pathname });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      aria-label="Öppna Brain"
      onClick={handleClick}
      disabled={busy}
      className="fixed bottom-24 right-6 z-50 h-12 w-12 rounded-full shadow-lg lg:bottom-6"
    >
      <Sparkles className="h-5 w-5" />
    </Button>
  );
};

export default BrainFloatingButton;
