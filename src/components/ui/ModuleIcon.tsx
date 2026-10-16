import { useId } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared 2A identity tile; navigation/status icons remain unframed. */
export function ModuleIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  const gradientId = `module-glyph-${useId().replace(/:/g, '')}`;
  return (
    <div aria-hidden="true" className={cn('operations-module-cube relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px]', className)}>
      <Icon className="relative z-10 h-[30px] w-[30px]" stroke={`url(#${gradientId})`} strokeWidth={2}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop className="cube-glyph-highlight" offset="0%" />
            <stop className="cube-glyph-vivid" offset="65%" />
            <stop className="cube-glyph-deep" offset="100%" />
          </linearGradient>
        </defs>
      </Icon>
    </div>
  );
}