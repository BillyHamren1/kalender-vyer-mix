/**
 * Broadcast service — del av den officiella centraliserade messaging-arkitekturen.
 *
 * Officiell väg:
 *   - Send broadcast   → `mobileApi.sendBroadcast` (mobile-app-api: send_broadcast)
 *   - Read broadcasts  → `mobileApi.getRecentBroadcasts` (mobile-app-api: get_recent_broadcasts)
 *   - Mark as read     → `mobileApi.markBroadcastRead`
 *
 * Frontend skriver ALDRIG direkt mot `broadcast_messages`. Edge-funktionen
 * `mobile-app-api` äger validering, org-scoping och auth — samma kontrakt
 * som DM/jobbchatt/inbox.
 */
import { mobileApi } from '@/services/mobileApiService';

export type BroadcastAudience = 'all_today' | 'job_staff' | 'active_staff' | 'selected_staff';
export type BroadcastCategory = 'info' | 'weather' | 'schedule' | 'logistics' | 'urgent';

export interface BroadcastMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  audience: BroadcastAudience;
  audience_booking_id: string | null;
  audience_staff_ids: string[] | null;
  category: BroadcastCategory;
  is_read_by: string[];
  created_at: string;
}

export const sendBroadcast = async (
  _senderId: string,
  senderName: string,
  content: string,
  audience: BroadcastAudience,
  category: BroadcastCategory,
  audienceBookingId?: string,
  audienceStaffIds?: string[],
): Promise<void> => {
  // sender_id ignoreras med flit — backend identifierar avsändaren från auth-token/JWT.
  // Vi behåller signaturen för bakåtkompatibilitet med befintliga callers.
  await mobileApi.sendBroadcast({
    content,
    audience,
    category,
    audience_booking_id: audienceBookingId || null,
    audience_staff_ids: audienceStaffIds || null,
    sender_name: senderName,
  });
};

export const fetchRecentBroadcasts = async (): Promise<BroadcastMessage[]> => {
  try {
    const result = await mobileApi.getRecentBroadcasts();
    return (result?.broadcasts as BroadcastMessage[]) || [];
  } catch (err) {
    console.error('Error fetching broadcasts:', err);
    return [];
  }
};
