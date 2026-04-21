import { supabase } from "@/integrations/supabase/client";
import type { GeoJSONPolygon } from "@/lib/geofenceEval";

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
}

export async function createOrganizationLocation(loc: UpsertLocationInput): Promise<OrganizationLocation> {
  const { data, error } = await supabase
    .from('organization_locations')
    .insert({
      name: loc.name,
      address: loc.address || null,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius_meters: loc.radius_meters || 100,
      show_as_project: loc.show_as_project || false,
      geofence_mode: loc.geofence_mode || 'circle',
      geofence_polygon: loc.geofence_polygon ?? null,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as OrganizationLocation;
}

export async function updateOrganizationLocation(id: string, updates: Partial<UpsertLocationInput> & { is_active?: boolean }): Promise<OrganizationLocation> {
  const { data, error } = await supabase
    .from('organization_locations')
    .update(updates as any)
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
