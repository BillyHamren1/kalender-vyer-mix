export type ProjectMessageType = 'internal' | 'supplier' | 'client';

export interface ProjectMessage {
  id: string;
  project_id: string;
  related_supplier_id: string | null;
  type: ProjectMessageType;
  message: string;
  sender_name: string;
  created_at: string;
}

export const MESSAGE_TYPE_LABELS: Record<ProjectMessageType, string> = {
  internal: 'Internt',
  supplier: 'Underleverantör',
  client: 'Kund',
};
