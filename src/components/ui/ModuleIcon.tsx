import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared 2A identity tile; navigation/status icons remain unframed. */
export function ModuleIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('operations-module-cube relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px]', className)}>
      <Icon className="relative z-10 h-[30px] w-[30px]" strokeWidth={1.8} />
    </div>
  );
}