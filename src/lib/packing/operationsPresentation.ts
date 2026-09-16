/**
 * Operations reads the effective packing decision from the WMS projection.
 * `packing_list_items.excluded` is the projected, effective value; Operations
 * must never infer packability from product names or old Booking categories.
 */
export interface OperationsPackingRow {
  /** Canonical effective value projected by WMS. */
  is_packable?: boolean | null;
  /** Legacy fallback for snapshots created before is_packable existed. */
  excluded?: boolean | null;
}

export interface OperationsPackingPresentation {
  isPackable: boolean;
  label: 'Packningsbar' | 'Ej packningsbar';
  rowClassName: string;
  nameClassName: string;
}

export function getOperationsPackingPresentation(
  row: OperationsPackingRow,
): OperationsPackingPresentation {
  const isPackable = row.is_packable ?? row.excluded !== true;

  return isPackable
    ? {
        isPackable: true,
        label: 'Packningsbar',
        rowClassName: '',
        nameClassName: '',
      }
    : {
        isPackable: false,
        label: 'Ej packningsbar',
        rowClassName: 'bg-muted/30 opacity-60',
        nameClassName: 'line-through text-muted-foreground',
      };
}
