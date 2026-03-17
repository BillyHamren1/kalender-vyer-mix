import React from 'react';
import { Loader2 } from 'lucide-react';
import { useShell } from '../ShellContext';
import AppLogo from '@/components/shared/AppLogo';

const ShellLoadingState: React.FC = () => {
  const { mode } = useShell();
  const logoMode = mode === 'scanner' ? 'scanner' : 'time';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
      <AppLogo mode={logoMode} size="md" showTagline={false} />
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
};

export default ShellLoadingState;
