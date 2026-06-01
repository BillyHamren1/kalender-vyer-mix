import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Search, Plus, Check, Truck } from 'lucide-react';
import type { Vehicle } from '@/hooks/useVehicles';

interface Props {
  teamId: string;
  teamTitle: string;
  vehicles: Vehicle[];
  assignedVehicleIds: string[];
  onPick: (vehicleId: string) => Promise<void> | void;
  onUnpick: (vehicleId: string) => Promise<void> | void;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Popover för att tilldela egna fordon till ett team för en viss dag.
 * Klick togglar tilldelningen (lägg till/ta bort). Stannar öppen för
 * flera val i rad.
 */
const TeamVehiclePickerPopover: React.FC<Props> = ({
  teamTitle,
  vehicles,
  assignedVehicleIds,
  onPick,
  onUnpick,
  children,
  open,
  onOpenChange,
}) => {
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const assignedSet = useMemo(() => new Set(assignedVehicleIds), [assignedVehicleIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? vehicles.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            (v.registration_number ?? '').toLowerCase().includes(q)
        )
      : vehicles;
    return [...list].sort((a, b) => {
      const aA = assignedSet.has(a.id) ? 1 : 0;
      const bA = assignedSet.has(b.id) ? 1 : 0;
      if (aA !== bA) return aA - bA;
      return a.name.localeCompare(b.name, 'sv');
    });
  }, [vehicles, query, assignedSet]);

  const handleToggle = async (vehicleId: string) => {
    if (pendingId) return;
    setPendingId(vehicleId);
    try {
      if (assignedSet.has(vehicleId)) await onUnpick(vehicleId);
      else await onPick(vehicleId);
    } finally {
      setPendingId(null);
    }
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
            Tilldela bil till
          </div>
          <div className="text-sm font-semibold truncate">{teamTitle}</div>
        </div>

        {vehicles.length > 0 && (
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Sök fordon..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto py-0.5">
          {vehicles.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
              Inga egna fordon registrerade.<br />
              Lägg till under Transportplanering → Fordon &amp; Partners.
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground italic">
              Inga matchande fordon
            </div>
          ) : (
            filtered.map((v) => {
              const isAssigned = assignedSet.has(v.id);
              const isPending = pendingId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleToggle(v.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1 text-left text-sm hover:bg-accent transition-colors ${
                    isPending ? 'opacity-50' : ''
                  }`}
                >
                  <Truck className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{v.name}</span>
                    {v.registration_number && (
                      <span className="block text-[10px] text-muted-foreground truncate">
                        {v.registration_number}
                      </span>
                    )}
                  </span>
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
          <span>{vehicles.length} egna fordon</span>
          <span>Esc för att stänga</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TeamVehiclePickerPopover;
