/**
 * Job-chat service — backward-compatible thin wrapper.
 *
 * Officiell väg för jobbchatt:
 *   - send / mark-read / archive / read-thread → `mobileApi` (mobileApiService)
 *   - alla anrop går genom edge-funktionen `mobile-app-api`
 *
 * Den här filen finns kvar enbart för att inte bryta äldre call-sites.
 * Nya komponenter ska importera `mobileApi` direkt.
 */
import { mobileApi } from './mobileApiService';

export interface JobMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  is_archived: boolean;
  is_archived_by?: string[];
  read_by?: string[];
  delivered_at?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  created_at: string;
}

export interface JobChatParticipant {
  id: string;
  name: string;
  role: 'planner' | 'team_leader' | 'staff';
}

/** READ — senaste sidan av meddelanden för en jobbtråd. */
export const fetchJobMessages = async (bookingId: string): Promise<JobMessage[]> => {
  if (!bookingId) return [];
  try {
    const result = await mobileApi.getJobMessages(bookingId);
    return (result?.messages as JobMessage[]) || [];
  } catch (err) {
    console.error('Error fetching job messages:', err);
    return [];
  }
};

/**
 * WRITE — skicka jobbmeddelande.
 * Bakåtkompatibel: stöder både legacy 5-args (bookingId, senderId, senderName, senderRole, content)
 * och ny 2-args-form (bookingId, content). sender*-args ignoreras — identiteten
 * resolvas server-side från auth-token.
 */
export const sendJobMessage = async (
  bookingId: string,
  contentOrLegacy?: string,
  _legacySenderName?: string,
  _legacySenderRole?: string,
  legacyContent?: string,
  options?: { fileUrl?: string; fileName?: string; fileType?: string },
): Promise<JobMessage | null> => {
  const finalContent = legacyContent !== undefined ? legacyContent : (contentOrLegacy ?? '');
  const result = await mobileApi.sendJobMessage({
    booking_id: bookingId,
    content: String(finalContent).trim(),
    file_url: options?.fileUrl,
    file_name: options?.fileName,
    file_type: options?.fileType,
  });
  return (result?.message as JobMessage) || null;
};

/** WRITE — markera hela jobbtråden som läst för aktuell användare. */
export const markJobRead = async (bookingId: string): Promise<void> => {
  await mobileApi.markJobRead(bookingId);
};

/** WRITE — arkivera hela jobbtråden för aktuell användare. */
export const archiveJobConversation = async (bookingId: string): Promise<void> => {
  await mobileApi.archiveJobConversation(bookingId);
};

/** READ — deltagare i jobbchatten (planners + tilldelad personal för datumet). */
export const fetchJobParticipants = async (
  bookingId: string,
  date: string,
): Promise<JobChatParticipant[]> => {
  if (!bookingId) return [];
  try {
    const result = await mobileApi.getJobParticipants(bookingId, date);
    return (result?.participants as JobChatParticipant[]) || [];
  } catch (err) {
    console.error('Error fetching job participants:', err);
    return [];
  }
};
