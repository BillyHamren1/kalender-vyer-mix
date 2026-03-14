import React from 'react';
import { Loader2, Clock, ScanLine } from 'lucide-react';
import { useShell } from '../ShellContext';

const ShellLoadingState: React.FC = () => {
  const { mode, appName } = useShell();

  const Icon = mode === 'scanner' ? ScanLine : Clock;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-foreground">{appName}</h2>
        <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
      </div>
    </div>
  );
};

export default ShellLoadingState;
