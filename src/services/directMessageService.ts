/**
 * Direct-message service — LEGACY WRAPPER (compat layer).
 *
 * Status: bibehållen för att stödja äldre call-sites som ännu inte migrerats:
 *   - src/hooks/useDirectMessages.ts        (fetchDirectMessages)
 *   - src/pages/CommunicationPage.tsx       (fetchDMInboxGrouped)
 *   - src/components/FloatingInbox.tsx      (fetchDMInboxGrouped)
 *   - src/components/ops-control/OpsActivityComms.tsx (fetchDMInboxGrouped)
 *
 * Officiell väg för NY kod (alla messaging-funktioner):
 *   - DM send / read / archive / inbox / unread → `mobileApi` direkt
 *     (mobileApiService.ts → mobile-app-api edge function)
 *   - Attachments (chat)                        → `mobileApi.uploadChatAttachment`
 *   - Job chat                                  → `mobileApi.sendJobMessage` etc.
 *   - Broadcasts                                → `mobileApi.sendBroadcast` etc.
 *
 * Alla anrop går genom edge-funktionen `mobile-app-api` som äger autentisering,
 * org-isolering och multi-identitet (staff_id + user_id). Frontenden gör inga
 * direkta DB-läsningar mot chat-tabeller.
 *
 * NY KOD: importera `mobileApi` direkt — använd inte denna wrapper.
 * Wrappern tas bort när alla call-sites ovan har migrerats.
 */
import { mobileApi } from './mobileApiService';

export interface DirectMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  recipient_id: string;
  recipient_name: string;
  content: string;
  is_read: boolean;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  booking_id?: string | null;
}

export interface GroupedConversation {
  recipientId: string;
  recipientName: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
  isSentByMe: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* READS                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Senaste sidan i en DM-tråd. Andra arg är behållet för backward-compat;
 * server resolverar caller-identitet från auth-token.
 */
export const fetchDirectMessages = async (
  _allMyIds: string[],
  allPartnerIds: string[],
): Promise<DirectMessage[]> => {
  if (allPartnerIds.length === 0) return [];
  // Caller-API:t passar in en lista av partner-id:n (UUID-spridning för en
  // person). Senaste sidan hämtas för det första matchande partner-id:t —
  // edge-funktionen normaliserar identiteten på serversidan.
  try {
    const result = await mobileApi.getDMThread(allPartnerIds[0]);
    return (result?.messages as DirectMessage[]) || [];
  } catch (err) {
    console.error('Error fetching direct messages:', err);
    return [];
  }
};

/** DM-inbox grupperad per partner. */
export const fetchDMInboxGrouped = async (_allMyIds: string[]): Promise<GroupedConversation[]> => {
  try {
    const result = await mobileApi.getDMInboxGrouped();
    return (result?.conversations as GroupedConversation[]) || [];
  } catch (err) {
    console.error('Error fetching grouped DM inbox:', err);
    return [];
  }
};

/**
 * Flat lista härledd från grupperad inbox (en rad per partner).
 * Föredra `fetchDMInboxGrouped` — denna är bara kvar för bakåtkompatibilitet.
 */
export const fetchDMInbox = async (allMyIds: string[]): Promise<DirectMessage[]> => {
  const grouped = await fetchDMInboxGrouped(allMyIds);
  return grouped.map((c) => ({
    id: `${c.recipientId}-${c.lastTimestamp}`,
    sender_id: c.isSentByMe ? '' : c.recipientId,
    sender_name: c.recipientName,
    sender_type: 'staff',
    recipient_id: c.isSentByMe ? c.recipientId : '',
    recipient_name: c.recipientName,
    content: c.lastMessage,
    is_read: c.unreadCount === 0,
    created_at: c.lastTimestamp,
  }));
};

/** Antal olästa DMs för aktuell användare. */
export const fetchUnreadDMCount = async (_allMyIds: string[]): Promise<number> => {
  try {
    const result = await mobileApi.getUnreadDMCount();
    return result?.count || 0;
  } catch (err) {
    console.error('Error fetching unread DM count:', err);
    return 0;
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* WRITES                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

/** Officiell signatur för att skicka DM. */
export const sendDM = async (
  recipientId: string,
  recipientName: string,
  content: string,
  options?: {
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    bookingId?: string;
  },
): Promise<void> => {
  await mobileApi.sendDirectMessage({
    recipient_id: recipientId,
    content: content.trim(),
    file_url: options?.fileUrl,
    file_name: options?.fileName,
    file_type: options?.fileType,
    booking_id: options?.bookingId,
  });
  // recipientName ignoreras: namnet hämtas server-side från staff/profile.
  void recipientName;
};

/**
 * Bakåtkompatibel signatur. sender*-args ignoreras — backend resolverar identiteten.
 */
export const sendDirectMessage = async (
  _senderId: string,
  _senderName: string,
  _senderType: 'planner' | 'staff',
  recipientId: string,
  recipientName: string,
  content: string,
  options?: {
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    bookingId?: string;
  },
): Promise<void> => {
  await sendDM(recipientId, recipientName, content, options);
};

/** Markera meddelanden från `senderId` som lästa. */
export const markDMRead = async (senderId: string): Promise<void> => {
  await mobileApi.markDMRead(senderId);
};

/** Bakåtkompatibel signatur. */
export const markDirectMessagesRead = async (
  _allMyIds: string[],
  senderId: string,
): Promise<void> => {
  await markDMRead(senderId);
};

/** Arkivera DM-tråd för aktuell användare. */
export const archiveDM = async (partnerId: string): Promise<void> => {
  await mobileApi.archiveDM(partnerId);
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* ATTACHMENTS                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Laddar upp chat-bilaga via mobile-app-api → `chat-attachments`-bucket.
 * Returnerar URL + metadata redo att bifogas på en DM eller jobbmeddelande.
 */
export const uploadChatAttachment = async (
  file: File,
): Promise<{ url: string; path: string; fileName: string; fileType: string }> => {
  const base64 = await fileToBase64(file);
  const result = await mobileApi.uploadChatAttachment({
    file_name: file.name,
    file_type: file.type || 'application/octet-stream',
    file_data_base64: base64,
  });
  return {
    url: result.url,
    // path returneras inte i den smala mobileApi-typen; behåll URL som path-fallback.
    path: (result as any).path ?? result.url,
    fileName: result.file_name,
    fileType: result.file_type ?? (file.type || 'application/octet-stream'),
  };
};

/** Bakåtkompatibelt alias för komponenter som fortfarande använder `uploadDMFile`. */
export const uploadDMFile = async (
  file: File,
  _senderId: string,
): Promise<{ url: string; fileName: string; fileType: string }> => {
  const r = await uploadChatAttachment(file);
  return { url: r.url, fileName: r.fileName, fileType: r.fileType };
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64," prefix
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
