import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared module identity tile (standard 2026-10-18): simple white line icon on
 * a discreet teal tile. Solid currentColor stroke — an SVG gradient stroke uses
 * objectBoundingBox and disappears on perfectly straight lines, which left
 * only the outer square visible on icons like Calendar.
 */
export function ModuleIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('operations-module-cube relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px]', className)}>
      <Icon className="relative z-10 h-[30px] w-[30px]" stroke="currentColor" strokeWidth={2} />
    </div>
  );
}
