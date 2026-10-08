import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Frontend contract tests for the messaging surface of mobileApiService.
// Validates that the SDK speaks the same language as the backend handlers
// (action names + data payload shape + response shape used by UI).

describe("mobileApiService — messaging contract", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  const fakeStaff = {
    id: "staff-1",
    name: "Test",
    email: null,
    phone: null,
    role: null,
    department: null,
    hourly_rate: null,
    overtime_rate: null,
  };

  async function setup() {
    const mod = await import("../mobileApiService");
    mod.setAuth("token", fakeStaff);
    return mod;
  }

  function lastCallBody() {
    return JSON.parse((mockFetch.mock.calls.at(-1)?.[1] as any).body);
  }

  // ── Job chat ──

  describe("job chat", () => {
    it("getJobMessages sends booking_id and pagination cursor", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ messages: [], has_more: false, next_cursor: null }),
      });
      await mobileApi.getJobMessages("b1", { before: "2026-01-01T00:00:00Z", limit: 30 });
      const body = lastCallBody();
      expect(body.action).toBe("get_job_messages");
      expect(body.data).toEqual({
        booking_id: "b1",
        before: "2026-01-01T00:00:00Z",
        limit: 30,
      });
    });

    it("sendJobMessage sends booking_id + content", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, message: { id: "m1" } }),
      });
      const res = await mobileApi.sendJobMessage({ booking_id: "b1", content: "Hej" });
      expect(res.success).toBe(true);
      const body = lastCallBody();
      expect(body.action).toBe("send_job_message");
      expect(body.data.booking_id).toBe("b1");
      expect(body.data.content).toBe("Hej");
    });

    it("markJobRead is idempotent in shape (sends booking_id only)", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, updated: 0 }),
      });
      const res = await mobileApi.markJobRead("b1");
      expect(res.updated).toBe(0); // idempotent: zero rows updated when already read
      const body = lastCallBody();
      expect(body.action).toBe("mark_job_read");
      expect(body.data).toEqual({ booking_id: "b1" });
    });

    it("archiveJobConversation returns archived_count", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, archived_count: 7 }),
      });
      const res = await mobileApi.archiveJobConversation("b1");
      expect(res).toEqual({ success: true, archived_count: 7 });
      const body = lastCallBody();
      expect(body.action).toBe("archive_job_conversation");
      expect(body.data.booking_id).toBe("b1");
    });

    it("unarchiveJobConversation returns unarchived_count", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, unarchived_count: 3 }),
      });
      const res = await mobileApi.unarchiveJobConversation("b1");
      expect(res.unarchived_count).toBe(3);
      const body = lastCallBody();
      expect(body.action).toBe("unarchive_job_conversation");
    });

    it("propagates 403 access-denied error from backend", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 403,
        ok: false,
        json: () => Promise.resolve({ error: "Access denied" }),
      });
      await expect(mobileApi.getJobMessages("b1")).rejects.toThrow("Access denied");
    });
  });

  // ── DMs ──

  describe("direct messages", () => {
    it("sendDirectMessage carries recipient + content", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true, message: { id: "dm1" } }),
      });
      await mobileApi.sendDirectMessage({ recipient_id: "u2", content: "Hej!" });
      const body = lastCallBody();
      expect(body.action).toBe("send_direct_message");
      expect(body.data).toMatchObject({ recipient_id: "u2", content: "Hej!" });
    });

    it("markDMRead targets a specific sender", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      await mobileApi.markDMRead("u2");
      const body = lastCallBody();
      expect(body.action).toBe("mark_dm_read");
      expect(body.data).toEqual({ sender_id: "u2" });
    });

    it("archiveDM + unarchiveDM use partner_id and report counts", async () => {
      const { mobileApi } = await setup();
      mockFetch
        .mockResolvedValueOnce({
          status: 200, ok: true,
          json: () => Promise.resolve({ success: true, archived_count: 4 }),
        })
        .mockResolvedValueOnce({
          status: 200, ok: true,
          json: () => Promise.resolve({ success: true, unarchived_count: 4 }),
        });

      const a = await mobileApi.archiveDM("u2");
      const u = await mobileApi.unarchiveDM("u2");
      expect(a.archived_count).toBe(4);
      expect(u.unarchived_count).toBe(4);
      expect(JSON.parse((mockFetch.mock.calls[0][1] as any).body).data).toEqual({ partner_id: "u2" });
      expect(JSON.parse((mockFetch.mock.calls[1][1] as any).body).data).toEqual({ partner_id: "u2" });
    });

    it("getUnreadDMCount returns a numeric count", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ count: 12 }),
      });
      const res = await mobileApi.getUnreadDMCount();
      expect(res.count).toBe(12);
      expect(lastCallBody().action).toBe("get_unread_dm_count");
    });

    it("getDMInboxGrouped exposes conversation summary shape", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200, ok: true,
        json: () => Promise.resolve({
          conversations: [
            { recipientId: "u2", recipientName: "Anna", lastMessage: "Hej!", lastTimestamp: "2026-01-01T10:00:00Z", unreadCount: 2, isSentByMe: false },
          ],
        }),
      });
      const res = await mobileApi.getDMInboxGrouped();
      expect(res.conversations).toHaveLength(1);
      expect(res.conversations[0]).toMatchObject({
        recipientId: "u2",
        unreadCount: 2,
        isSentByMe: false,
      });
    });
  });

  // ── Inbox aggregator ──

  describe("inbox aggregator", () => {
    it("getInboxAll returns conversations + broadcasts + bookings with unread counts", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200, ok: true,
        json: () => Promise.resolve({
          conversations: [
            { partner_id: "u2", partner_name: "Anna", last_message: { content: "x", created_at: "2026-01-01T10:00:00Z" }, unread_count: 1, archived: false, messages: [] },
          ],
          broadcasts: [
            { id: "br1", content: "Driftinfo", category: "info", is_read: false, created_at: "2026-01-01T09:00:00Z" },
          ],
          bookings: [
            { id: "b1", client: "Kund AB", status: "CONFIRMED", last_message_content: "Hej", last_message_at: "2026-01-01T08:00:00Z", unread_count: 3 },
          ],
        }),
      });
      const res = await mobileApi.getInboxAll();
      expect(res.conversations[0].unread_count).toBe(1);
      expect(res.broadcasts[0].is_read).toBe(false);
      expect(res.bookings[0].unread_count).toBe(3);
      expect(lastCallBody().action).toBe("get_inbox_all");
    });
  });

  // ── Attachments ──

  describe("upload_chat_attachment", () => {
    it("returns url + file_name + file_type/mime_type for chat input", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 200, ok: true,
        json: () => Promise.resolve({
          success: true,
          path: "org/staff/123_abc_photo.jpg",
          url: "https://cdn.example.com/photo.jpg",
          file_name: "photo.jpg",
          file_type: "image/jpeg",
          mime_type: "image/jpeg",
        }),
      });
      const res = await mobileApi.uploadChatAttachment({
        file_name: "photo.jpg",
        file_type: "image/jpeg",
        file_data_base64: "AAAA",
      });
      expect(res.success).toBe(true);
      expect(res.url).toMatch(/^https:\/\//);
      expect(res.file_name).toBe("photo.jpg");
      expect(res.file_type).toBe("image/jpeg");
      const body = lastCallBody();
      expect(body.action).toBe("upload_chat_attachment");
      expect(body.data.file_name).toBe("photo.jpg");
    });

    it("propagates 415 unsupported mime error", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 415, ok: false,
        json: () => Promise.resolve({ error: "Unsupported mime type: application/x-msdownload" }),
      });
      await expect(
        mobileApi.uploadChatAttachment({
          file_name: "evil.exe",
          file_type: "application/x-msdownload",
          file_data_base64: "AAAA",
        }),
      ).rejects.toThrow(/Unsupported mime type/);
    });

    it("propagates 413 file-too-large error", async () => {
      const { mobileApi } = await setup();
      mockFetch.mockResolvedValueOnce({
        status: 413, ok: false,
        json: () => Promise.resolve({ error: "File too large (max 15 MB)" }),
      });
      await expect(
        mobileApi.uploadChatAttachment({
          file_name: "big.pdf",
          file_type: "application/pdf",
          file_data_base64: "AAAA",
        }),
      ).rejects.toThrow(/too large/i);
    });
  });

  // ── Contacts ──

  describe("getContacts", () => {
    it("returns a deduplicated, sorted contact list shape", async () => {
      const { mobileApi } = await setup();
      // Backend dedups staff_members + planners by user_id/email, returns one entry per person.
      mockFetch.mockResolvedValueOnce({
        status: 200, ok: true,
        json: () => Promise.resolve({
          contacts: [
            { id: "s2", name: "Anna", type: "staff", roles: ["staff"] },
            { id: "u3", name: "Bertil", type: "planner", roles: ["projekt"] },
          ],
        }),
      });
      const res = await mobileApi.getContacts();
      expect(res.contacts).toHaveLength(2);
      // Contract: each contact has id + name + type
      for (const c of res.contacts) {
        expect(c.id).toBeTruthy();
        expect(c.name).toBeTruthy();
        expect(typeof c.type).toBe("string");
      }
      // Caller (staff-1) must never appear in own contact list
      expect(res.contacts.find((c: any) => c.id === "staff-1")).toBeUndefined();
      expect(lastCallBody().action).toBe("get_contacts");
    });
  });
});
