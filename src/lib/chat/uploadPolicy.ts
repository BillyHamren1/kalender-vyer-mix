/**
 * Single source of truth for chat attachment rules.
 *
 * Used by:
 *   - `useChatUpload`          (mobile, XHR upload)
 *   - `ChatInput`              (mobile, file picker accept attr)
 *   - `OpsDirectChat`          (web admin chat)
 *   - `directMessageService.uploadChatAttachment` (web wrapper)
 *   - `mobile-app-api` edge function (backend validation)
 *
 * ⚠ The backend MUST mirror these constants. When you change anything here,
 *    update the matching block in `supabase/functions/mobile-app-api/index.ts`
 *    inside `handleUploadChatAttachment` (search for "CHAT_UPLOAD_POLICY").
 */

/** Hard cap shared by client and server. */
export const CHAT_UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
export const CHAT_UPLOAD_MAX_MB = CHAT_UPLOAD_MAX_BYTES / (1024 * 1024);

/** MIME whitelist — server enforces, client filters early. */
export const CHAT_UPLOAD_ALLOWED_MIME: readonly string[] = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
] as const;

/** File-extension fallback (when browser doesn't supply a MIME). */
export const CHAT_UPLOAD_ALLOWED_EXTENSIONS: readonly string[] = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv',
] as const;

/**
 * Value for an `<input type="file" accept="…">` attribute.
 * Combines explicit MIME + extension hints so all browsers/WebViews behave the same.
 */
export const CHAT_UPLOAD_ACCEPT_ATTR =
  [...CHAT_UPLOAD_ALLOWED_MIME, ...CHAT_UPLOAD_ALLOWED_EXTENSIONS].join(',');

/** A preview thumbnail can be rendered for these MIME prefixes. */
export const CHAT_UPLOAD_PREVIEWABLE_MIME_PREFIXES = ['image/'] as const;

export const isPreviewableType = (mime: string | null | undefined): boolean => {
  if (!mime) return false;
  return CHAT_UPLOAD_PREVIEWABLE_MIME_PREFIXES.some((p) => mime.startsWith(p));
};

const getExtension = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

export interface ValidateResult {
  ok: boolean;
  /** Localized (Swedish) message when not ok. Safe to pass to `toast.error`. */
  error?: string;
}

/**
 * Single client-side validator. Both UI surfaces (`ChatInput`, `OpsDirectChat`)
 * call this before kicking off an upload, so error messages stay identical
 * and the server never sees a request that the UI could have caught locally.
 */
export const validateChatAttachment = (file: File): ValidateResult => {
  if (!file || file.size === 0) {
    return { ok: false, error: 'Filen är tom' };
  }
  if (file.size > CHAT_UPLOAD_MAX_BYTES) {
    return { ok: false, error: `Filen är för stor (max ${CHAT_UPLOAD_MAX_MB} MB)` };
  }

  const mime = (file.type || '').toLowerCase();
  const ext = getExtension(file.name);

  const mimeOk = mime.length > 0 && CHAT_UPLOAD_ALLOWED_MIME.includes(mime);
  const extOk = ext.length > 0 && CHAT_UPLOAD_ALLOWED_EXTENSIONS.includes(ext);

  if (!mimeOk && !extOk) {
    return { ok: false, error: 'Filtypen stöds inte' };
  }
  return { ok: true };
};
