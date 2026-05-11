import { supabase } from "@/integrations/supabase/client";
import type { GeoJSONPolygon } from "@/lib/geofenceEval";

export type LocationType =
  | 'warehouse'
  | 'project_site'
  | 'customer_site'
  | 'supplier'
  | 'private_residence'
  | 'other';

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  warehouse: 'Warehouse',
  project_site: 'Projektplats',
  customer_site: 'Kundplats',
  supplier: 'Supplier',
  private_residence: 'Boende',
  other: 'Övrig plats',
};

export interface LocationMetadata {
  isWorkLocation?: boolean;
  isPrivateResidence?: boolean;
  canCountAsWork?: boolean;
  canAutoStartWork?: boolean;
  notes?: string;
  [key: string]: unknown;
}

export interface OrganizationLocation {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  show_as_project: boolean;
  geofence_mode: 'circle' | 'polygon';
  geofence_polygon: GeoJSONPolygon | null;
  location_type: LocationType;
  is_private_residence: boolean;
  privacy_level: 'normal' | 'private';
  metadata: LocationMetadata;
  created_at: string;
  updated_at: string;
}

export async function fetchOrganizationLocations(): Promise<OrganizationLocation[]> {
  const { data, error } = await supabase
    .from('organization_locations')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data || []) as unknown as OrganizationLocation[];
}

export async function fetchAllOrganizationLocations(): Promise<OrganizationLocation[]> {
  const { data, error } = await supabase
    .from('organization_locations')
    .select('*')
    .order('name');

  if (error) throw error;
  return (data || []) as unknown as OrganizationLocation[];
}

export interface UpsertLocationInput {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
  show_as_project?: boolean;
  geofence_mode?: 'circle' | 'polygon';
  geofence_polygon?: GeoJSONPolygon | null;
  location_type?: LocationType;
  is_private_residence?: boolean;
  privacy_level?: 'normal' | 'private';
  metadata?: LocationMetadata;
}

function buildResidenceMetadata(input: UpsertLocationInput): LocationMetadata {
  const isResidence =
    input.location_type === 'private_residence' || input.is_private_residence === true;
  const base: LocationMetadata = { ...(input.metadata ?? {}) };
  if (isResidence) {
    base.isWorkLocation = false;
    base.isPrivateResidence = true;
    base.canCountAsWork = false;
    base.canAutoStartWork = false;
  } else {
    if (base.isPrivateResidence == null) base.isPrivateResidence = false;
    if (base.isWorkLocation == null) base.isWorkLocation = true;
  }
  return base;
}

export async function createOrganizationLocation(loc: UpsertLocationInput): Promise<OrganizationLocation> {
  const isResidence =
    loc.location_type === 'private_residence' || loc.is_private_residence === true;

  const { data, error } = await supabase
    .from('organization_locations')
    .insert({
      name: loc.name,
      address: loc.address || null,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius_meters: isResidence ? 0 : (loc.radius_meters || 100),
      show_as_project: isResidence ? false : (loc.show_as_project || false),
      geofence_mode: isResidence ? 'polygon' : (loc.geofence_mode || 'circle'),
      geofence_polygon: loc.geofence_polygon ?? null,
      location_type: loc.location_type || 'other',
      is_private_residence: isResidence,
      privacy_level: isResidence ? 'private' : (loc.privacy_level || 'normal'),
      metadata: buildResidenceMetadata(loc),
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as OrganizationLocation;
}

export async function updateOrganizationLocation(
  id: string,
  updates: Partial<UpsertLocationInput> & { is_active?: boolean },
): Promise<OrganizationLocation> {
  const isResidence =
    updates.location_type === 'private_residence' || updates.is_private_residence === true;

  const payload: Record<string, unknown> = { ...updates };
  if (isResidence) {
    payload.is_private_residence = true;
    payload.privacy_level = 'private';
    payload.geofence_mode = 'polygon';
    payload.show_as_project = false;
    payload.radius_meters = 0;
  }
  if (updates.metadata !== undefined || updates.location_type !== undefined || updates.is_private_residence !== undefined) {
    payload.metadata = buildResidenceMetadata(updates as UpsertLocationInput);
  }

  const { data, error } = await supabase
    .from('organization_locations')
    .update(payload as any)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as OrganizationLocation;
}

export async function deleteOrganizationLocation(id: string): Promise<void> {
  const { error } = await supabase
    .from('organization_locations')
    .update({ is_active: false } as any)
    .eq('id', id);

  if (error) throw error;
}
