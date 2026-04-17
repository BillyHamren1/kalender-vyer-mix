import React from 'react';
import { ArrowRight, Plus, Minus, Package, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  WarehouseProjectChange,
  WAREHOUSE_CHANGE_LABELS,
  WAREHOUSE_DATE_FIELD_LABELS,
} from '@/types/warehouseProjectChanges';

const formatDate = (v: string | null) => {
  if (!v) return '–';
  try {
    return format(new Date(v), 'd MMM yyyy', { locale: sv });
  } catch {
    return v;
  }
};

interface Props {
  change: WarehouseProjectChange;
}

export const WarehouseChangeRow: React.FC<Props> = ({ change }) => {
  const isDate = change.change_type === 'date_changed';
  const Icon =
    change.change_type === 'product_added' ? Plus
    : change.change_type === 'product_removed' ? Minus
    : isDate ? Calendar
    : Package;

  const fieldLabel = isDate
    ? WAREHOUSE_DATE_FIELD_LABELS[change.field_name || ''] || change.field_name
    : change.field_name;

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
      <div className="p-1 rounded bg-muted/40 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {WAREHOUSE_CHANGE_LABELS[change.change_type]}
          </span>
          <span className="font-medium text-foreground truncate">{fieldLabel}</span>
        </div>
        {(change.old_value || change.new_value) && (
          <div className="flex items-center gap-2 mt-1 text-xs">
            <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive line-through">
              {isDate ? formatDate(change.old_value) : (change.old_value ?? '–')}
            </span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800">
              {isDate ? formatDate(change.new_value) : (change.new_value ?? '–')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
