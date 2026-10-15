import type { WorkspaceRecord } from './operations-project-workspace-contract.ts';
export const SUPPLIER_STATUS: Record<string,string> = {draft:'Inte kontaktad',request_sent:'Väntar på svar',quote_received:'Svar mottaget',negotiating:'Svar mottaget',confirmed:'Bekräftad',cancelled:'Avböjt'};
export const THREAD_STATUS: Record<string,string> = {sending:'Skickar',sent:'Väntar på svar',replied:'Svar mottaget',confirmed:'Bekräftad',declined:'Avböjt',failed:'Misslyckades'};
/** Same owner transport presentation, export for the web card to consume too. */
export function workspaceTransportDisplay(t: WorkspaceRecord): WorkspaceRecord {
  const contact = t.supplier?.contacts?.find((c: any) => c.id === t.supplier_contact_id) || t.supplier?.primary_contact || t.supplier?.contacts?.[0];
  const confirmed = t.planning_status === 'confirmed' || t.partner_response === 'accepted';
  return {...t,nextPlanningStatus:confirmed ? 'preliminary' : 'confirmed',planningActionLabel:confirmed ? 'Gör preliminär' : 'Bekräfta transport',groupLabel:t.status === 'delivered' ? 'Utförda' : confirmed ? 'Bekräftade' : 'Preliminära',displayName:t.supplier?.name || t.vehicle?.name || (t.transport_type === 'internal' ? 'Intern transport' : 'Fordon ej bestämt'),statusLabel:confirmed ? 'Bekräftad' : 'Preliminär',contactName:contact?.name || t.vehicle?.contact_person || null,contactPhone:contact?.phone || t.supplier?.phone || t.vehicle?.contact_phone || null};
}


export function projectListDisplayName(name: string, isInternal: boolean, client?: string | null, bookingNumber?: string | null): string {
 return isInternal ? name : client ? `${client}${bookingNumber ? ' #' + bookingNumber : ''}` : name;
}

export function workspaceTransportGroups<T extends WorkspaceRecord>(rows: T[]) {
 return ['Preliminära','Bekräftade','Utförda'].map(title=>({title,items:rows.filter(row=>workspaceTransportDisplay(row).groupLabel===title)}));
}
