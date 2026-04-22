import { useCallback, useRef, useState } from 'react';
import { getToken } from '@/services/mobileApiService';
import { validateChatAttachment } from '@/lib/chat/uploadPolicy';
import { supabase } from '@/integrations/supabase/client';
import { t as translate, type Locale } from '@/i18n/translations';

const SUPABASE_URL = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mobile-app-api`;

const getLocale = (): Locale => {
  try {
    const stored = localStorage.getItem('eventflow-locale');
    return stored === 'en' ? 'en' : 'sv';
  } catch {
    return 'sv';
  }
};
const tr = (key: any, vars?: any) => translate(key, getLocale(), vars);

export interface UploadedAttachment {
  url: string;
  name: string;
  type: string;
  preview?: string;
}

export interface PendingAttachment extends UploadedAttachment {
  status: 'uploading' | 'ready' | 'failed';
  progress: number;
  source?: File;
  error?: string;
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(((r.result as string) || '').split(',')[1] || '');
    r.onerror = () => reject(r.error || new Error(tr('chat.couldNotReadFile')));
    r.readAsDataURL(file);
  });

interface UploadResponse {
  success: boolean;
  url: string;
  file_name: string;
  file_type: string | null;
  error?: string;
}

export const useChatUpload = () => {
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setPending((p) => {
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return null;
    });
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const v = validateChatAttachment(file);
    if (!v.ok) throw new Error(v.error || tr('chat.fileNotAllowed'));

    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

    setPending({
      url: '',
      name: file.name,
      type: file.type,
      preview,
      source: file,
      status: 'uploading',
      progress: 0,
    });

    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch (err: any) {
      setPending((p) => p ? { ...p, status: 'failed', error: err?.message || tr('chat.couldNotReadFile') } : p);
      return;
    }

    const token = getToken();
    const body = JSON.stringify({
      action: 'upload_chat_attachment',
      data: { file_name: file.name, file_type: file.type, file_data_base64: base64 },
    });

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', FUNCTION_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
      setPending((p) => (p && p.status === 'uploading' ? { ...p, progress: pct } : p));
    };

    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status < 200 || xhr.status >= 300) {
        setPending((p) => p ? { ...p, status: 'failed', error: tr('chat.uploadFailedStatus', { status: xhr.status }) } : p);
        return;
      }
      let parsed: UploadResponse | null = null;
      try { parsed = JSON.parse(xhr.responseText); } catch { /* fallthrough */ }
      if (!parsed?.success || !parsed.url) {
        setPending((p) => p ? { ...p, status: 'failed', error: parsed?.error || tr('chat.invalidServerResponse') } : p);
        return;
      }
      setPending((p) => p ? {
        ...p,
        url: parsed!.url,
        name: parsed!.file_name || p.name,
        type: parsed!.file_type || p.type,
        progress: 100,
        status: 'ready',
        error: undefined,
      } : p);
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      setPending((p) => p ? { ...p, status: 'failed', error: tr('chat.networkError') } : p);
    };

    xhr.onabort = () => {
      xhrRef.current = null;
    };

    xhr.send(body);
  }, []);

  const retry = useCallback(() => {
    const f = pending?.source;
    if (!f) return;
    void uploadFile(f);
  }, [pending?.source, uploadFile]);

  const consume = useCallback(() => {
    setPending((p) => {
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return null;
    });
  }, []);

  return { pending, uploadFile, cancel, retry, consume };
};
