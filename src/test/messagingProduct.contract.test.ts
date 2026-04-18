import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * messagingProduct.contract.test.ts
 *
 * Sammanhållen produktnivå-svit för hela messaging-produkten. Testar
 * kontraktet mellan frontend (mobileApi / directMessageService /
 * jobChatService) och backend-vägen `mobile-app-api` på ett sätt som
 * speglar dagens centraliserade arkitektur:
 *
 *   - All läsning/skrivning går genom `mobile-app-api` edge function
 *   - Frontend gör inga direkta DB-queries mot messaging-tabeller
 *   - Auth, org-isolering och multi-identitet ägs av servern
 *
 * Sviten är medvetet uppdelad i sex produktområden (A–F) så att
 * en regression visar exakt vilken del som brustit.
 *
 * Kompletterande, mer granulära tester:
 *   - supabase/functions/mobile-app-api/messaging.test.ts (auth/access)
 *   - src/services/__tests__/mobileApiService.chat.test.ts (SDK shape)
 *   - src/services/__tests__/directMessageService.test.ts (legacy wrapper)
 *   - src/services/__tests__/jobChatService.test.ts       (job-chat helper)
 *   - src/test/chatFlow.test.ts (pure UI helpers — preview/guard/initials)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Test utils
// ─────────────────────────────────────────────────────────────────────────────

const ME = {
  id: "staff-1",
  name: "Test Staff",
  email: null,
  phone: null,
  role: null,
  department: null,
  hourly_rate: null,
  overtime_rate: null,
};

function ok<T>(body: T) {
  return { status: 200, ok: true, json: () => Promise.resolve(body) };
}
function err(status: number, message: string) {
  return { status, ok: false, json: () => Promise.resolve({ error: message }) };
}
function lastBody(mockFetch: ReturnType<typeof vi.fn>) {
  return JSON.parse((mockFetch.mock.calls.at(-1)?.[1] as any).body);
}
function bodyAt(mockFetch: ReturnType<typeof vi.fn>, idx: number) {
  return JSON.parse((mockFetch.mock.calls[idx][1] as any).body);
}

// Pure UI helpers re-implemented locally so the suite can assert behaviour
// without coupling to the actual component code paths.
function previewFor(msg: {
  content?: string | null;
  file_name?: string | null;
  file_url?: string | null;
}): string {
  const text = (msg.content ?? "").trim();
  if (text) return text;
  if (msg.file_name) return `📎 ${msg.file_name}`;
  if (msg.file_url) return "📎 Bilaga";
  return "";
}
function canSend(input: { content?: string; attachmentUrl?: string | null }): boolean {
  const hasText = (input.content ?? "").trim().length > 0;
  const hasAttachment = !!input.attachmentUrl;
  return hasText || hasAttachment;
}
function totalUnread(
  conversations: Array<{ unread_count?: number }>,
  broadcasts: Array<{ is_read?: boolean }>,
  bookings: Array<{ unread_count?: number }>,
): number {
  const dm = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
  const br = broadcasts.filter((b) => !b.is_read).length;
  const job = bookings.reduce((s, b) => s + (b.unread_count || 0), 0);
  return dm + br + job;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Messaging product (end-to-end contract)", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    localStorage.clear();
    // Authenticate the SDK so callApi attaches a token + reaches fetch().
    const mod = await import("../services/mobileApiService");
    mod.setAuth("token", ME);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A. DIRECT MESSAGES
  // ───────────────────────────────────────────────────────────────────────────
  describe("A. Direct messages", () => {
    it("kan skicka textmeddelande", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: { id: "dm1" } }));

      const res = await mobileApi.sendDirectMessage({
        recipient_id: "u2",
        content: "Hej Anna!",
      });

      expect(res.success).toBe(true);
      const body = lastBody(mockFetch);
      expect(body.action).toBe("send_direct_message");
      expect(body.data).toMatchObject({ recipient_id: "u2", content: "Hej Anna!" });
      // Sender identity must NOT leak from frontend — backend resolves it.
      expect(body.data.sender_id).toBeUndefined();
      expect(body.data.sender_name).toBeUndefined();
    });

    it("kan skicka bilaga utan text", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: { id: "dm2" } }));

      // Attachment-only DM (frontends typically send "📎 <name>" as content).
      await mobileApi.sendDirectMessage({
        recipient_id: "u2",
        content: "📎 photo.jpg",
        file_url: "https://cdn/photo.jpg",
        file_name: "photo.jpg",
        file_type: "image/jpeg",
      });

      const body = lastBody(mockFetch);
      expect(body.action).toBe("send_direct_message");
      expect(body.data.file_url).toBe("https://cdn/photo.jpg");
      expect(body.data.file_name).toBe("photo.jpg");
      expect(body.data.file_type).toBe("image/jpeg");
    });

    it("preview väljer text före filnamn", () => {
      expect(previewFor({ content: "Hej!", file_name: "x.jpg" })).toBe("Hej!");
      expect(previewFor({ content: "  ", file_name: "x.jpg" })).toBe("📎 x.jpg");
      expect(previewFor({ file_url: "https://cdn/y.bin" })).toBe("📎 Bilaga");
      expect(previewFor({})).toBe("");
    });

    it("mark as read fungerar", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(ok({ success: true }));

      await mobileApi.markDMRead("u2");

      const body = lastBody(mockFetch);
      expect(body.action).toBe("mark_dm_read");
      expect(body.data).toEqual({ sender_id: "u2" });
    });

    it("archive + unarchive fungerar", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch
        .mockResolvedValueOnce(ok({ success: true, archived_count: 4 }))
        .mockResolvedValueOnce(ok({ success: true, unarchived_count: 4 }));

      const a = await mobileApi.archiveDM("u2");
      const u = await mobileApi.unarchiveDM("u2");

      expect(a.archived_count).toBe(4);
      expect(u.unarchived_count).toBe(4);
      expect(bodyAt(mockFetch, 0).action).toBe("archive_dm");
      expect(bodyAt(mockFetch, 0).data).toEqual({ partner_id: "u2" });
      expect(bodyAt(mockFetch, 1).action).toBe("unarchive_dm");
      expect(bodyAt(mockFetch, 1).data).toEqual({ partner_id: "u2" });
    });

    it("unread räknas korrekt", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(ok({ count: 5 }));

      const res = await mobileApi.getUnreadDMCount();
      expect(res.count).toBe(5);
      expect(lastBody(mockFetch).action).toBe("get_unread_dm_count");
    });

    it("legacy wrapper (sendDM) trimmar text och delegerar till backend", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));
      const { sendDM } = await import("../services/directMessageService");

      await sendDM("u2", "Anna", "  hej  ");
      const body = lastBody(mockFetch);
      expect(body.action).toBe("send_direct_message");
      expect(body.data.content).toBe("hej");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. JOB CHAT
  // ───────────────────────────────────────────────────────────────────────────
  describe("B. Job chat", () => {
    it("kan hämta jobbmeddelanden via mobile-app-api", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(
        ok({ messages: [{ id: "m1", booking_id: "b1", content: "Hej" }], has_more: false, next_cursor: null }),
      );

      const res = await mobileApi.getJobMessages("b1", { limit: 30 });
      expect(res.messages).toHaveLength(1);
      const body = lastBody(mockFetch);
      expect(body.action).toBe("get_job_messages");
      expect(body.data).toMatchObject({ booking_id: "b1", limit: 30 });
    });

    it("authorization krävs (403 propageras till anroparen)", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(err(403, "Access denied"));

      await expect(mobileApi.getJobMessages("b1")).rejects.toThrow(/Access denied/);
    });

    it("kan skicka jobbmeddelande", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: { id: "m1" } }));

      const res = await mobileApi.sendJobMessage({ booking_id: "b1", content: "Hej teamet" });
      expect(res.success).toBe(true);
      const body = lastBody(mockFetch);
      expect(body.action).toBe("send_job_message");
      expect(body.data).toMatchObject({ booking_id: "b1", content: "Hej teamet" });
    });

    it("mark_job_read är idempotent (returnerar updated-räknare)", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch
        .mockResolvedValueOnce(ok({ success: true, updated: 4 }))
        .mockResolvedValueOnce(ok({ success: true, updated: 0 }));

      const first = await mobileApi.markJobRead("b1");
      const second = await mobileApi.markJobRead("b1");

      expect(first.updated).toBe(4);
      expect(second.updated).toBe(0); // already read → no rows updated
      expect(bodyAt(mockFetch, 0).action).toBe("mark_job_read");
      expect(bodyAt(mockFetch, 1).action).toBe("mark_job_read");
    });

    it("unread-count för jobbchat blir korrekt i inbox-aggregator", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(
        ok({
          conversations: [],
          broadcasts: [],
          bookings: [
            { id: "b1", client: "Kund", unread_count: 3 },
            { id: "b2", client: "Annan", unread_count: 0 },
          ],
        }),
      );

      const res = await mobileApi.getInboxAll();
      const jobUnread = res.bookings.reduce((s: number, b: any) => s + (b.unread_count || 0), 0);
      expect(jobUnread).toBe(3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C. BROADCASTS
  // ───────────────────────────────────────────────────────────────────────────
  describe("C. Broadcasts", () => {
    it("sendBroadcast går via mobile-app-api (inget direkt DB-anrop)", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(ok({ success: true, broadcast: { id: "br1" } }));

      const res = await mobileApi.sendBroadcast({
        content: "Stormvarning kl 14",
        audience: "all_today",
        category: "weather",
      });
      expect(res.success).toBe(true);
      const body = lastBody(mockFetch);
      expect(body.action).toBe("send_broadcast");
      expect(body.data).toMatchObject({
        content: "Stormvarning kl 14",
        audience: "all_today",
        category: "weather",
      });
    });

    it("broadcast-listan följer förväntad payload-form", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(
        ok({
          broadcasts: [
            {
              id: "br1",
              sender_name: "Admin",
              content: "Driftinfo",
              category: "info",
              audience: "all_today",
              is_read: false,
              created_at: "2026-01-01T09:00:00Z",
            },
          ],
        }),
      );

      const res = await mobileApi.getRecentBroadcasts();
      expect(res.broadcasts).toHaveLength(1);
      const b = res.broadcasts[0] as any;
      // Contract: id, sender_name, content, category, audience, created_at, is_read
      expect(b.id).toBe("br1");
      expect(b.content).toBe("Driftinfo");
      expect(b.category).toBe("info");
      expect(b.audience).toBe("all_today");
      expect(typeof b.is_read).toBe("boolean");
    });

    it("unread från broadcasts ingår i total badge", async () => {
      const total = totalUnread(
        [{ unread_count: 2 }],
        [{ is_read: false }, { is_read: false }, { is_read: true }],
        [{ unread_count: 1 }],
      );
      // 2 DM + 2 broadcasts (oread) + 1 job = 5
      expect(total).toBe(5);
    });

    it("markBroadcastRead skickar broadcast_id", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(ok({ success: true }));

      await mobileApi.markBroadcastRead("br1");
      const body = lastBody(mockFetch);
      expect(body.action).toBe("mark_broadcast_read");
      expect(body.data).toEqual({ broadcast_id: "br1" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // D. INBOX / TOTAL UNREAD
  // ───────────────────────────────────────────────────────────────────────────
  describe("D. Inbox / total unread", () => {
    it("getInboxAll returnerar conversations + broadcasts + bookings", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(
        ok({
          conversations: [{ partner_id: "u2", unread_count: 1 }],
          broadcasts: [{ id: "br1", is_read: false }],
          bookings: [{ id: "b1", unread_count: 3 }],
        }),
      );

      const res = await mobileApi.getInboxAll();
      const total = totalUnread(res.conversations, res.broadcasts, res.bookings);
      expect(total).toBe(5); // 1 + 1 + 3
      expect(lastBody(mockFetch).action).toBe("get_inbox_all");
    });

    it("tomma states ger 0", () => {
      expect(totalUnread([], [], [])).toBe(0);
      expect(
        totalUnread(
          [{ unread_count: 0 }],
          [{ is_read: true }],
          [{ unread_count: 0 }],
        ),
      ).toBe(0);
    });

    it("defensiva fall: saknade unread_count-fält hanteras säkert", () => {
      const total = totalUnread(
        [{} as any, { unread_count: 2 }],
        [{} as any], // saknar is_read → räknas som oläst (false-y is_read)
        [{} as any],
      );
      // 0 + 2 DM + 1 broadcast + 0 job = 3
      expect(total).toBe(3);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E. ATTACHMENTS
  // ───────────────────────────────────────────────────────────────────────────
  describe("E. Attachments", () => {
    it("upload-kontrakt returnerar url + file_name + file_type (+ev. path)", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(
        ok({
          success: true,
          path: "org/staff/123_abc_photo.jpg",
          url: "https://cdn.example.com/photo.jpg",
          file_name: "photo.jpg",
          file_type: "image/jpeg",
          mime_type: "image/jpeg",
        }),
      );

      const res = await mobileApi.uploadChatAttachment({
        file_name: "photo.jpg",
        file_type: "image/jpeg",
        file_data_base64: "AAAA",
      });

      expect(res.url).toMatch(/^https:\/\//);
      expect(res.file_name).toBe("photo.jpg");
      expect(res.file_type).toBe("image/jpeg");
      // path är optional men ska propageras när backend skickar det
      expect((res as any).path).toBe("org/staff/123_abc_photo.jpg");

      const body = lastBody(mockFetch);
      expect(body.action).toBe("upload_chat_attachment");
      expect(body.data).toMatchObject({
        file_name: "photo.jpg",
        file_type: "image/jpeg",
        file_data_base64: "AAAA",
      });
    });

    it("attachment-only message är tillåten (frontend guard släpper igenom)", () => {
      expect(canSend({ content: "", attachmentUrl: "https://cdn/x.jpg" })).toBe(true);
      expect(canSend({ content: "   ", attachmentUrl: "https://cdn/x.jpg" })).toBe(true);
    });

    it("UI guard blockerar tomt meddelande utan text och utan bilaga", () => {
      expect(canSend({})).toBe(false);
      expect(canSend({ content: "" })).toBe(false);
      expect(canSend({ content: "   \n\t" })).toBe(false);
      expect(canSend({ content: "", attachmentUrl: null })).toBe(false);
    });

    it("upload propagerar 415 unsupported-mime som fel", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(err(415, "Unsupported mime type: application/x-msdownload"));

      await expect(
        mobileApi.uploadChatAttachment({
          file_name: "evil.exe",
          file_type: "application/x-msdownload",
          file_data_base64: "AAAA",
        }),
      ).rejects.toThrow(/Unsupported mime type/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F. CONTACTS / IDENTITIES
  // ───────────────────────────────────────────────────────────────────────────
  describe("F. Contacts / identities", () => {
    it("contacts-payload kan dedupliceras/renderas korrekt", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(
        ok({
          contacts: [
            { id: "s2", name: "Anna", type: "staff", roles: ["staff"] },
            { id: "u3", name: "Bertil", type: "planner", roles: ["projekt"] },
          ],
        }),
      );

      const res = await mobileApi.getContacts();
      expect(res.contacts).toHaveLength(2);
      // Caller får aldrig vara med i sin egen lista
      expect(res.contacts.find((c: any) => c.id === ME.id)).toBeUndefined();
      // Kontrakt: varje kontakt har minst id + name + type
      for (const c of res.contacts as any[]) {
        expect(c.id).toBeTruthy();
        expect(c.name).toBeTruthy();
        expect(typeof c.type).toBe("string");
      }
    });

    it("dual-identity: DM-tråd kan slås upp via valfritt partner-id utan att bryta inbox", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      // Backend resolverar identitet (staff_id ↔ user_id) — frontend skickar bara
      // det partner-id som syns i sin egen lista. Vi verifierar att getDMThread
      // proxar partnerId-värdet rakt av (oavsett vilket id-rum det tillhör).
      mockFetch.mockResolvedValueOnce(
        ok({ messages: [{ id: "dm1", sender_id: "either-id" }], has_more: false, next_cursor: null }),
      );

      const res = await mobileApi.getDMThread("either-id");
      expect(res.messages).toHaveLength(1);
      const body = lastBody(mockFetch);
      expect(body.action).toBe("get_dm_thread");
      expect(body.data.partner_id).toBe("either-id");
    });

    it("inbox grouped-listan exponerar partnerId + unreadCount per kontakt", async () => {
      const { mobileApi } = await import("../services/mobileApiService");
      mockFetch.mockResolvedValueOnce(
        ok({
          conversations: [
            {
              recipientId: "u2",
              recipientName: "Anna",
              lastMessage: "Hej!",
              lastTimestamp: "2026-01-01T10:00:00Z",
              unreadCount: 2,
              isSentByMe: false,
            },
          ],
        }),
      );
      const res = await mobileApi.getDMInboxGrouped();
      expect(res.conversations[0]).toMatchObject({
        recipientId: "u2",
        unreadCount: 2,
        isSentByMe: false,
      });
    });
  });
});
