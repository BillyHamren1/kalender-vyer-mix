import { Badge } from "@/components/ui/badge";
import type { SupplierStatus } from "@/types/supplier";
import { SUPPLIER_STATUS_LABELS } from "@/types/supplier";

const STATUS_STYLES: Record<SupplierStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  request_sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  quote_received: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  negotiating: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export const SupplierStatusBadge = ({ status }: { status: SupplierStatus }) => (
  <Badge className={`${STATUS_STYLES[status]} border-0 font-medium`}>
    {SUPPLIER_STATUS_LABELS[status]}
  </Badge>
);
