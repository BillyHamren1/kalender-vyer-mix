export type WarehouseProjectStatus = 'planning' | 'in_progress' | 'completed' | 'cancelled';
export type WarehouseInboxStatus = 'new' | 'converted' | 'dismissed';
export type WarehouseInboxSourceType = 'project' | 'large_project';

export interface WarehouseProject {
  id: string;
  organization_id: string;
  project_number: string;
  name: string;
  source_project_id: string | null;
  source_large_project_id: string | null;
  source_project_number: string | null;
  status: WarehouseProjectStatus;
  start_date: string | null;
  end_date: string | null;
  manager_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface WarehouseProjectInboxItem {
  id: string;
  organization_id: string;
  source_type: WarehouseInboxSourceType;
  source_id: string;
  source_project_number: string | null;
  client_name: string | null;
  event_date: string | null;
  status: WarehouseInboxStatus;
  warehouse_project_id: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface WarehouseProjectTask {
  id: string;
  warehouse_project_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  status: WarehouseProjectStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const WAREHOUSE_PROJECT_STATUS_LABELS: Record<WarehouseProjectStatus, string> = {
  planning: 'Planering',
  in_progress: 'Pågår',
  completed: 'Klart',
  cancelled: 'Avbokat',
};

export const WAREHOUSE_PROJECT_STATUS_COLORS: Record<WarehouseProjectStatus, string> = {
  planning: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};
