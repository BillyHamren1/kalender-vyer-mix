import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// directMessageService is a thin wrapper over `mobileApi` (which posts JSON
// to the `mobile-app-api` Edge Function via fetch). We assert the wire format
// (action + data shape) and the back-compat signatures by mocking `fetch`.

describe("directMessageService", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    localStorage.clear();
    // Authenticate the SDK so callApi attaches a token and reaches fetch().
    const mod = await import("../mobileApiService");
    mod.setAuth("token", {
      id: "staff-1",
      name: "Test",
      email: null,
      phone: null,
      role: null,
      department: null,
      hourly_rate: null,
      overtime_rate: null,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  function ok(body: any) {
    return { status: 200, ok: true, json: () => Promise.resolve(body) };
  }
  function lastBody() {
    return JSON.parse((mockFetch.mock.calls.at(-1)?.[1] as any).body);
  }

  describe("fetchDirectMessages", () => {
    it("returns [] when no partner ids supplied", async () => {
      const { fetchDirectMessages } = await import("../directMessageService");
      const res = await fetchDirectMessages(["me"], []);
      expect(res).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("invokes get_dm_thread with first partner id", async () => {
      mockFetch.mockResolvedValueOnce(ok({ messages: [{ id: "dm1" }] }));
      const { fetchDirectMessages } = await import("../directMessageService");
      const res = await fetchDirectMessages(["me"], ["u2"]);
      expect(res).toHaveLength(1);
      const body = lastBody();
      expect(body.action).toBe("get_dm_thread");
      expect(body.data.partner_id).toBe("u2");
    });

    it("returns [] on backend error (UI continues)", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500, ok: false, json: () => Promise.resolve({ error: "net" }) });
      const { fetchDirectMessages } = await import("../directMessageService");
      const res = await fetchDirectMessages(["me"], ["u2"]);
      expect(res).toEqual([]);
    });
  });

  describe("sendDM + sendDirectMessage (legacy)", () => {
    it("sendDM invokes send_direct_message with trimmed content", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));
      const { sendDM } = await import("../directMessageService");
      await sendDM("u2", "Anna", "  hej!  ");
      const body = lastBody();
      expect(body.action).toBe("send_direct_message");
      expect(body.data).toMatchObject({
        recipient_id: "u2",
        content: "hej!",
      });
    });

    it("legacy sendDirectMessage delegates to sendDM, ignores sender args", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));
      const { sendDirectMessage } = await import("../directMessageService");
      await sendDirectMessage(
        "ignored-sender-id",
        "ignored-sender-name",
        "staff",
        "u2",
        "Anna",
        "Hej",
      );
      const body = lastBody();
      expect(body.data.recipient_id).toBe("u2");
      expect(body.data.content).toBe("Hej");
      // sender* args must NOT leak into the payload — backend resolves identity.
      expect(body.data.sender_id).toBeUndefined();
      expect(body.data.sender_name).toBeUndefined();
    });
  });

  describe("uploadChatAttachment", () => {
    function fakeFile(name: string, type: string, contents = "abc") {
      return new File([contents], name, { type });
    }

    it("base64-encodes the file and returns normalized metadata", async () => {
      mockFetch.mockResolvedValueOnce(ok({
        success: true,
        path: "org/u/1_abc_pic.jpg",
        url: "https://cdn/pic.jpg",
        file_name: "pic.jpg",
        file_type: "image/jpeg",
        mime_type: "image/jpeg",
      }));
      const { uploadChatAttachment } = await import("../directMessageService");
      const res = await uploadChatAttachment(fakeFile("pic.jpg", "image/jpeg"));
      expect(res).toEqual({
        url: "https://cdn/pic.jpg",
        path: "org/u/1_abc_pic.jpg",
        fileName: "pic.jpg",
        fileType: "image/jpeg",
      });
      const body = lastBody();
      expect(body.action).toBe("upload_chat_attachment");
      expect(body.data.file_name).toBe("pic.jpg");
      expect(body.data.file_type).toBe("image/jpeg");
      expect(typeof body.data.file_data_base64).toBe("string");
      expect(body.data.file_data_base64.length).toBeGreaterThan(0);
    });

    it("uploadDMFile alias returns the same shape (back-compat)", async () => {
      mockFetch.mockResolvedValueOnce(ok({
        success: true, path: "p", url: "u", file_name: "f.jpg", file_type: "image/jpeg", mime_type: "image/jpeg",
      }));
      const { uploadDMFile } = await import("../directMessageService");
      const res = await uploadDMFile(fakeFile("f.jpg", "image/jpeg"), "ignored-sender");
      expect(res).toEqual({ url: "u", fileName: "f.jpg", fileType: "image/jpeg" });
    });

    it("propagates backend error messages (e.g. mime/size rejection)", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 415, ok: false,
        json: () => Promise.resolve({ error: "Unsupported mime type: application/x-msdownload" }),
      });
      const { uploadChatAttachment } = await import("../directMessageService");
      await expect(
        uploadChatAttachment(fakeFile("evil.exe", "application/x-msdownload")),
      ).rejects.toThrow(/Unsupported mime type/);
    });
  });

  describe("read + archive + unread", () => {
    it("markDMRead invokes mark_dm_read with sender_id", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));
      const { markDMRead } = await import("../directMessageService");
      await markDMRead("u2");
      const body = lastBody();
      expect(body.action).toBe("mark_dm_read");
      expect(body.data).toEqual({ sender_id: "u2" });
    });

    it("legacy markDirectMessagesRead delegates to markDMRead", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));
      const { markDirectMessagesRead } = await import("../directMessageService");
      await markDirectMessagesRead(["me-staff", "me-auth"], "u2");
      const body = lastBody();
      expect(body.action).toBe("mark_dm_read");
      expect(body.data).toEqual({ sender_id: "u2" });
    });

    it("archiveDM invokes archive_dm with partner_id", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, archived_count: 4 }));
      const { archiveDM } = await import("../directMessageService");
      await archiveDM("u2");
      const body = lastBody();
      expect(body.action).toBe("archive_dm");
      expect(body.data).toEqual({ partner_id: "u2" });
    });

    it("fetchUnreadDMCount returns numeric count", async () => {
      mockFetch.mockResolvedValueOnce(ok({ count: 9 }));
      const { fetchUnreadDMCount } = await import("../directMessageService");
      expect(await fetchUnreadDMCount(["me"])).toBe(9);
      expect(lastBody().action).toBe("get_unread_dm_count");
    });

    it("fetchUnreadDMCount returns 0 on error (no throw)", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500, ok: false, json: () => Promise.resolve({ error: "x" }) });
      const { fetchUnreadDMCount } = await import("../directMessageService");
      expect(await fetchUnreadDMCount(["me"])).toBe(0);
    });
  });

  describe("fetchDMInboxGrouped + fetchDMInbox", () => {
    it("returns grouped conversations with unread + sentByMe flags", async () => {
      mockFetch.mockResolvedValueOnce(ok({
        conversations: [
          { recipientId: "u2", recipientName: "Anna", lastMessage: "Hej!", lastTimestamp: "2026-01-01T10:00:00Z", unreadCount: 2, isSentByMe: false },
          { recipientId: "u3", recipientName: "Bertil", lastMessage: "OK", lastTimestamp: "2026-01-01T09:00:00Z", unreadCount: 0, isSentByMe: true },
        ],
      }));
      const { fetchDMInboxGrouped } = await import("../directMessageService");
      const res = await fetchDMInboxGrouped(["me"]);
      expect(res).toHaveLength(2);
      expect(res[0].unreadCount).toBe(2);
      expect(res[1].isSentByMe).toBe(true);
    });

    it("fetchDMInbox derives a flat preview list from grouped backend data", async () => {
      mockFetch.mockResolvedValueOnce(ok({
        conversations: [
          { recipientId: "u2", recipientName: "Anna", lastMessage: "Hej!", lastTimestamp: "2026-01-01T10:00:00Z", unreadCount: 2, isSentByMe: false },
        ],
      }));
      const { fetchDMInbox } = await import("../directMessageService");
      const res = await fetchDMInbox(["me"]);
      expect(res).toHaveLength(1);
      expect(res[0].is_read).toBe(false);
      expect(res[0].content).toBe("Hej!");
      expect(res[0].sender_id).toBe("u2"); // not sent by me → sender = partner
    });
  });
});
