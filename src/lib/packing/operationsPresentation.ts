/**
 * Operations reads the effective packing decision from the WMS projection.
 * `packing_list_items.excluded` is the projected, effective value; Operations
 * must never infer packability from product names or old Booking categories.
 */
export interface OperationsPackingRow {
  /** Canonical effective value projected by WMS. */
  is_packable?: boolean | null;
  /** Historically retired row. Never revived by a stale is_packable value. */
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
  // Canonical rule: excluded !== true && is_packable !== false.
  const isPackable = row.excluded !== true && row.is_packable !== false;


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
