import { createClient } from 'npm:@supabase/supabase-js@2'
import { createStaffAuthHandler, type Staff } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const sharedSecret = Deno.env.get('TIME_OPERATIONS_AUTH_SHARED_SECRET') ?? ''
const admin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

Deno.serve(createStaffAuthHandler(admin ? sharedSecret : '', {
  async findCredentials(identifier) {
    if (!admin) throw new Error('directory_unavailable')
    const { data, error } = await admin.rpc('time_find_staff_credentials_v1', { p_identifier: identifier })
    if (error || !Array.isArray(data)) throw new Error('directory_unavailable')
    return data
  },
  async findActiveStaff(organizationId, staffId) {
    if (!admin) throw new Error('directory_unavailable')
    const { data, error } = await admin.rpc('time_find_active_staff_v1', {
      p_organization_id: organizationId,
      p_staff_id: staffId,
    }).maybeSingle()
    if (error) throw new Error('directory_unavailable')
    return data as Staff | null
  },
}))
