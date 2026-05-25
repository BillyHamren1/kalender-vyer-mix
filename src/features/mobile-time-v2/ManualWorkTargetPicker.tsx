/**
 * ManualWorkTargetPicker — låter användaren själv välja var en manuell
 * tidsrad ska sparas. Systemet auto-väljer ALDRIG.
 *
 * Grupper:
 *  - Dina planerade jobb (assigned)
 *  - Platser / lager (locations)
 *  - Sök annat projekt (searchable — placeholder i v1)
 *  - Övrigt arbete / ej kopplat (other — visar varning)
 */
import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Warehouse, Search, AlertTriangle, Check } from 'lucide-react';
import type { ManualWorkTarget, ManualWorkTargets } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: ManualWorkTargets;
  currentTarget: ManualWorkTarget | null;
  onSelect: (target: ManualWorkTarget) => void;
}

const OTHER_TARGET: ManualWorkTarget = {
  targetType: 'other',
  targetId: null,
  label: 'Övrigt arbete',
  subtitle: 'Inte kopplat till projekt',
};

const TargetRow: React.FC<{
  target: ManualWorkTarget;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}> = ({ target, selected, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3 py-2.5 rounded-lg border transition flex items-center gap-3 ${
      selected
        ? 'border-primary bg-primary/5'
        : 'border-border bg-card hover:bg-accent/40'
    }`}
  >
    <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
      selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
    }`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium truncate">{target.label}</div>
      {target.subtitle && (
        <div className="text-xs text-muted-foreground truncate">{target.subtitle}</div>
      )}
    </div>
    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
  </button>
);

const ManualWorkTargetPicker: React.FC<Props> = ({
  open, onOpenChange, targets, currentTarget, onSelect,
}) => {
  const [searchQ, setSearchQ] = useState('');
  const filteredSearchable = targets.searchableTargets.filter((t) =>
    t.label.toLowerCase().includes(searchQ.toLowerCase()),
  );

  const isSelected = (t: ManualWorkTarget) =>
    !!currentTarget &&
    currentTarget.targetType === t.targetType &&
    (currentTarget.targetId ?? null) === (t.targetId ?? null);

  const handleSelect = (t: ManualWorkTarget) => {
    onSelect(t);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Vart hör tiden hemma?</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Assigned */}
          {targets.assignedTargets.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dina planerade jobb
              </h3>
              <div className="space-y-1.5">
                {targets.assignedTargets.map((t) => (
                  <TargetRow
                    key={`${t.targetType}:${t.targetId}`}
                    target={t}
                    selected={isSelected(t)}
                    onClick={() => handleSelect(t)}
                    icon={<Briefcase className="h-4 w-4" />}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Locations */}
          {targets.locationTargets.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Platser & lager
              </h3>
              <div className="space-y-1.5">
                {targets.locationTargets.map((t) => (
                  <TargetRow
                    key={`${t.targetType}:${t.targetId}`}
                    target={t}
                    selected={isSelected(t)}
                    onClick={() => handleSelect(t)}
                    icon={<Warehouse className="h-4 w-4" />}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Searchable */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sök annat projekt
            </h3>
            {targets.searchableTargets.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                Sök är inte aktiverat än. Välj från listorna ovan eller "Övrigt arbete".
              </div>
            ) : (
              <>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Sök projekt…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                />
                <div className="space-y-1.5">
                  {filteredSearchable.slice(0, 30).map((t) => (
                    <TargetRow
                      key={`${t.targetType}:${t.targetId}`}
                      target={t}
                      selected={isSelected(t)}
                      onClick={() => handleSelect(t)}
                      icon={<Search className="h-4 w-4" />}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Other / unassigned */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Övrigt
            </h3>
            <TargetRow
              target={OTHER_TARGET}
              selected={isSelected(OTHER_TARGET)}
              onClick={() => handleSelect(OTHER_TARGET)}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <Badge variant="outline" className="text-[10px] font-normal text-amber-700 border-amber-300 bg-amber-50">
              Denna tid hamnar inte på projektkostnad förrän den kopplas.
            </Badge>
          </section>

          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ManualWorkTargetPicker;
