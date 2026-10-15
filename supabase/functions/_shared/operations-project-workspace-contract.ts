/** Owner-produced snapshot of the existing Operations three-tab workspace. */
export type WorkspaceRecord = Record<string, any>;
export interface OperationsProjectWorkspace {
  schema: 'operations-project-workspace.v1';
  projectId: string;
  capabilities: { canWrite: boolean };
  project: { id: string; name: string; bookingId: string | null; projectLeader: string | null };
  header: { bookingNumber: string | null; client: string; eventDate: string | null; address: string | null; contactName: string | null };
  booking: WorkspaceRecord | null;
  notes: { value: string; target: 'booking' | 'project' };
  files: { projectFiles: WorkspaceRecord[] | null; bookingAttachments: WorkspaceRecord[] | null };
  planning: { transports: WorkspaceRecord[] | null; emailLogs: WorkspaceRecord[] | null; tasks: WorkspaceRecord[] | null; suppliers: WorkspaceRecord[] | null; threads: WorkspaceRecord[] | null };
  costs: { productCosts: WorkspaceRecord | null; extraCosts: WorkspaceRecord | null; legacyOverrides: WorkspaceRecord[] | null };
  sectionErrors: Record<string, string>;
}
