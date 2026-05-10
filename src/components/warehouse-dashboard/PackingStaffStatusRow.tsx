/**
 * PackingStaffStatusRow — compact status strip shown under each packing row in
 * warehouse UI. Surfaces:
 *   - Tilldelad personal (chips) eller "Saknar personal"
 *   - "Syns i Time-appen" (om warehouse_assignments finns)
 *   - "Saknar packingId" (defensiv — fallback om hooken kallas utan id)
 *   - "Redo för scanner" (packing finns + status passande för out-flöde)
 *   - Tilldela-knapp som öppnar AssignStaffToPackingDialog
 *
 * Visar aldrig tekniska begrepp (lager-1, transport, resource_id).
 */
import { useState } from 'react';
import { UserPlus, Users, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useWarehousePackingStaff } from '@/hooks/useWarehousePackingStaff';
import AssignStaffToPackingDialog from '@/components/warehouse/AssignStaffToPackingDialog';
import { cn } from '@/lib/utils';

interface Props {
  packingId: string | null | undefined;
  packingName?: string;
  packingStatus?: string;
  /** Compact mode hides chip names and shows just count + key badges. */
  compact?: boolean;
  className?: string;
}

const Badge = ({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'warning' | 'info' | 'neutral';
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border',
      tone === 'success' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
      tone === 'warning' && 'bg-amber-50 text-amber-800 border-amber-200',
      tone === 'info' && 'bg-blue-50 text-blue-700 border-blue-200',
      tone === 'neutral' && 'bg-muted text-muted-foreground border-border',
    )}
  >
    {icon}
    {children}
  </span>
);

const READY_FOR_SCANNER_STATUSES = new Set([
  'planning',
  'in_progress',
  'packed',
  'returning',
  'back',
]);

const PackingStaffStatusRow: React.FC<Props> = ({
  packingId,
  packingName,
  packingStatus,
  compact = false,
  className,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { assigned, inTimeApp } = useWarehousePackingStaff(packingId ?? null);

  if (!packingId) {
    return (
      <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
        <Badge tone="warning" icon={<AlertTriangle className="w-3 h-3" />}>
          Saknar packingId
        </Badge>
      </div>
    );
  }

  const hasStaff = assigned.length > 0;
  const readyForScanner = !!packingStatus && READY_FOR_SCANNER_STATUSES.has(packingStatus);

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      {/* Staff chips or "saknar personal" */}
      {hasStaff ? (
        compact ? (
          <Badge tone="success" icon={<Users className="w-3 h-3" />}>
            {assigned.length} {assigned.length === 1 ? 'tilldelad' : 'tilldelade'}
          </Badge>
        ) : (
          <div className="flex items-center gap-1 flex-wrap">
            <Users className="w-3 h-3 text-muted-foreground" />
            {assigned.slice(0, 4).map((a) => (
              <span
                key={a.assignment_id}
                className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium border border-primary/20"
              >
                {a.name}
              </span>
            ))}
            {assigned.length > 4 && (
              <span className="text-[11px] text-muted-foreground">+{assigned.length - 4}</span>
            )}
          </div>
        )
      ) : (
        <Badge tone="warning" icon={<AlertTriangle className="w-3 h-3" />}>
          Saknar personal
        </Badge>
      )}

      {inTimeApp && (
        <Badge tone="info" icon={<CheckCircle2 className="w-3 h-3" />}>
          Syns i Time-appen
        </Badge>
      )}

      {readyForScanner && (
        <Badge tone="success" icon={<Package className="w-3 h-3" />}>
          Redo för scanner
        </Badge>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDialogOpen(true);
        }}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
      >
        <UserPlus className="w-3 h-3" />
        Tilldela
      </button>

      <AssignStaffToPackingDialog
        packingId={packingId}
        packingName={packingName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
};

export default PackingStaffStatusRow;
