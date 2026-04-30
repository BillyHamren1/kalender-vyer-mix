import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Search, Plus, Check } from 'lucide-react';
import type { AvailableStaffMember } from './TimeGridAvailableStaff';

interface Props {
  teamId: string;
  teamTitle: string;
  staff: AvailableStaffMember[];
  /** Staff already assigned to THIS team for this day (will appear with check icon). */
  assignedStaffIds?: string[];
  onPick: (staffId: string) => Promise<void> | void;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Popover anchored to a team header. Lets the user assign staff to the team
 * for the given day. Stays open across multiple picks so several people can
 * be added in a row — closes only on outside click / Esc / explicit close.
 */
const TeamStaffPickerPopover: React.FC<Props> = ({
  teamId,
  teamTitle,
  staff,
  assignedStaffIds = [],
  onPick,
  children,
  open,
  onOpenChange,
}) => {
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());

  const assignedSet = useMemo(() => new Set(assignedStaffIds), [assignedStaffIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? staff.filter((s) => s.name.toLowerCase().includes(q))
      : staff;
    // Sort: not-yet-assigned first, then alphabetically
    return [...list].sort((a, b) => {
      const aA = assignedSet.has(a.id) ? 1 : 0;
      const bA = assignedSet.has(b.id) ? 1 : 0;
      if (aA !== bA) return aA - bA;
      return a.name.localeCompare(b.name, 'sv');
    });
  }, [staff, query, assignedSet]);

  const handlePick = async (staffId: string) => {
    if (pendingId) return;
    setPendingId(staffId);
    try {
      await onPick(staffId);
      setRecentlyAdded((prev) => {
        const next = new Set(prev);
        next.add(staffId);
        return next;
      });
    } finally {
      setPendingId(null);
    }
    // NOTE: do NOT close — user may want to add multiple
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-64 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 py-2 border-b">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Tilldela personal till
          </div>
          <div className="text-sm font-semibold truncate">{teamTitle}</div>
        </div>

        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Sök..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-7 h-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto py-0.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
              Inga matchande personer
            </div>
          ) : (
            filtered.map((s) => {
              const isAssigned = assignedSet.has(s.id) || recentlyAdded.has(s.id);
              const isPending = pendingId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => handlePick(s.id)}
                  className={`w-full flex items-center gap-2 px-3 py-0.5 text-left text-sm hover:bg-accent transition-colors ${
                    isPending ? 'opacity-50' : ''
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-border"
                    style={{ backgroundColor: s.color || 'hsl(var(--muted))' }}
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  {isAssigned ? (
                    <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-3 py-1.5 border-t flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{staff.length} tillgängliga</span>
          <span>Esc för att stänga</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TeamStaffPickerPopover;
