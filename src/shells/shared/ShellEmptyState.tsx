import React from 'react';
import { Clock, ScanLine, Inbox } from 'lucide-react';
import { useShell } from '../ShellContext';

interface ShellEmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}

const ShellEmptyState: React.FC<ShellEmptyStateProps> = ({ title, description, icon }) => {
  const { mode } = useShell();

  const defaults = mode === 'scanner'
    ? { title: 'Inga aktiva jobb', description: 'Skanna en QR-kod eller välj ett jobb för att börja.', icon: <ScanLine className="h-10 w-10 text-muted-foreground/40" /> }
    : { title: 'Inget att visa', description: 'Du har inga jobb eller tidrapporter just nu.', icon: <Clock className="h-10 w-10 text-muted-foreground/40" /> };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
        {icon || defaults.icon}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title || defaults.title}</h3>
      <p className="text-sm text-muted-foreground max-w-[260px]">{description || defaults.description}</p>
    </div>
  );
};

export default ShellEmptyState;
