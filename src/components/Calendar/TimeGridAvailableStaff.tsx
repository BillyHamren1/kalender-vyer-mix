import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface AvailableStaffMember {
  id: string;
  name: string;
  color?: string;
  assignedTeamIds?: string[];
  assignedTeamId?: string;
  assignedTeamName?: string;
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
  staff: AvailableStaffMember[];
  selectingForTeam: { id: string; title: string } | null;
  expanded: boolean;
  onToggleExpanded?: () => void;
  onPickStaff: (staffId: string) => void;
  onCancelSelection: () => void;
}

const SECTION_HEIGHT_COLLAPSED = 78;
const SECTION_HEIGHT_EXPANDED = 132;
const GRID_HEIGHT_COLLAPSED = 48;
const GRID_HEIGHT_EXPANDED = 108;
const FOOTER_HEIGHT = 18;

/**
 * "Available staff" rail that floats above each day card. Multi-team aware:
 * always shows every active staff member; selection mode lets the user click
 * to add to the currently active team.
 */
const TimeGridAvailableStaff: React.FC<Props> = ({
  containerRef,
  staff,
  selectingForTeam,
  expanded,
  onToggleExpanded,
  onPickStaff,
  onCancelSelection,
}) => {
  const sectionHeight = expanded ? SECTION_HEIGHT_EXPANDED : SECTION_HEIGHT_COLLAPSED;
  const gridHeight = expanded ? GRID_HEIGHT_EXPANDED : GRID_HEIGHT_COLLAPSED;

  const maxCollapsed = 10;
  const displayStaff = expanded ? staff : staff.slice(0, maxCollapsed);
  const hasMore = staff.length > maxCollapsed;

  return (
    <div
      ref={containerRef}
      className="rounded-t-2xl"
      style={{
        background: selectingForTeam
          ? 'linear-gradient(180deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.08) 100%)'
          : 'linear-gradient(180deg, hsl(var(--muted) / 0.5) 0%, hsl(var(--muted) / 0.3) 100%)',
        borderBottom: '1px solid hsl(var(--border) / 0.6)',
        padding: '4px 6px',
        height: `${sectionHeight}px`,
        minHeight: `${sectionHeight}px`,
        maxHeight: `${sectionHeight}px`,
        transition: 'background 0.2s ease, height 0.2s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '4px',
          maxHeight: `${gridHeight}px`,
          minHeight: `${gridHeight}px`,
          overflowY: 'auto',
          alignContent: 'start',
        }}
      >
        {displayStaff.map((s) => {
          const firstName = s.name.trim().split(' ')[0];
          return (
            <div
              key={s.id}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${selectingForTeam ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 hover:scale-105 transition-all' : ''}`}
              style={{ backgroundColor: s.color || 'hsl(var(--muted))', color: '#000' }}
              title={selectingForTeam ? `Tilldela ${s.name} till ${selectingForTeam.title}` : s.name}
              onClick={selectingForTeam ? () => onPickStaff(s.id) : undefined}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 flex-shrink-0" />
              <span>{firstName}</span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          minHeight: `${FOOTER_HEIGHT}px`,
          height: `${FOOTER_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '2px',
        }}
      >
        {hasMore ? (
          <button
            onClick={onToggleExpanded}
            className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors"
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" />Visa mindre</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" />Visa alla ({staff.length - maxCollapsed} till)</>
            )}
          </button>
        ) : (
          <div />
        )}

        {staff.length === 0 && (
          <span className="text-[9px] text-muted-foreground/60 italic">Inga tillgängliga</span>
        )}
      </div>

      {selectingForTeam && (
        <button
          onClick={onCancelSelection}
          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground mt-1"
          style={{ alignSelf: 'flex-start' }}
        >
          Avbryt
        </button>
      )}
    </div>
  );
};

export default TimeGridAvailableStaff;
