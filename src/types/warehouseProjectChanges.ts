export type WarehouseChangeType =
  | 'product_added'
  | 'product_removed'
  | 'quantity_changed'
  | 'date_changed';

export interface WarehouseProjectChange {
  id: string;
  organization_id: string;
  warehouse_project_id: string;
  source_booking_id: string | null;
  change_type: WarehouseChangeType;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
}

export const WAREHOUSE_CHANGE_LABELS: Record<WarehouseChangeType, string> = {
  product_added: 'Produkt tillagd',
  product_removed: 'Produkt borttagen',
  quantity_changed: 'Antal ändrat',
  date_changed: 'Datum ändrat',
};

export const WAREHOUSE_DATE_FIELD_LABELS: Record<string, string> = {
  eventdate: 'Eventdatum',
  rigdaydate: 'Riggdatum',
  rigdowndate: 'Nedriggsdatum',
};
