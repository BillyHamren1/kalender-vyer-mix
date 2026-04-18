import { describe, it, expect, vi, beforeEach } from "vitest";

// directMessageService is a thin wrapper over supabase.functions.invoke
// targeting the mobile-app-api edge function. We assert the wire format
// (action + data shape) and the back-compat signatures.

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
  },
}));

describe("directMessageService", () => {
  beforeEach(() => invokeMock.mockReset());

  describe("fetchDirectMessages", () => {
    it("returns [] when no partner ids supplied", async () => {
      const { fetchDirectMessages } = await import("../directMessageService");
      const res = await fetchDirectMessages(["me"], []);
      expect(res).toEqual([]);
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it("invokes get_dm_thread with partner_ids", async () => {
      invokeMock.mockResolvedValueOnce({
        data: { messages: [{ id: "dm1" }] },
        error: null,
      });
      const { fetchDirectMessages } = await import("../directMessageService");
      const res = await fetchDirectMessages(["me"], ["u2"]);
      expect(res).toHaveLength(1);
      const body = invokeMock.mock.calls[0][1].body;
      expect(body.action).toBe("get_dm_thread");
      expect(body.data.partner_ids).toEqual(["u2"]);
    });

    it("returns [] on backend error (UI continues)", async () => {
      invokeMock.mockResolvedValueOnce({ data: null, error: new Error("net") });
      const { fetchDirectMessages } = await import("../directMessageService");
      const res = await fetchDirectMessages(["me"], ["u2"]);
      expect(res).toEqual([]);
    });
  });

  describe("sendDM + sendDirectMessage (legacy)", () => {
    it("sendDM invokes send_direct_message with trimmed content", async () => {
      invokeMock.mockResolvedValueOnce({ data: { success: true }, error: null });
      const { sendDM } = await import("../directMessageService");
      await sendDM("u2", "Anna", "  hej!  ");
      const body = invokeMock.mock.calls[0][1].body;
      expect(body.action).toBe("send_direct_message");
      expect(body.data).toMatchObject({
        recipient_id: "u2",
        recipient_name: "Anna",
        content: "hej!",
      });
    });

    it("legacy sendDirectMessage delegates to sendDM, ignores sender args", async () => {
      invokeMock.mockResolvedValueOnce({ data: { success: true }, error: null });
      const { sendDirectMessage } = await import("../directMessageService");
      await sendDirectMessage(
        "ignored-sender-id",
        "ignored-sender-name",
        "staff",
        "u2",
        "Anna",
        "Hej",
      );
      const body = invokeMock.mock.calls[0][1].body;
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
      invokeMock.mockResolvedValueOnce({
        data: {
          success: true,
          path: "org/u/1_abc_pic.jpg",
          url: "https://cdn/pic.jpg",
          file_name: "pic.jpg",
          mime_type: "image/jpeg",
        },
        error: null,
      });
      const { uploadChatAttachment } = await import("../directMessageService");
      const res = await uploadChatAttachment(fakeFile("pic.jpg", "image/jpeg"));
      expect(res).toEqual({
        url: "https://cdn/pic.jpg",
        path: "org/u/1_abc_pic.jpg",
        fileName: "pic.jpg",
        fileType: "image/jpeg",
      });
      const body = invokeMock.mock.calls[0][1].body;
      expect(body.action).toBe("upload_chat_attachment");
      expect(body.data.file_name).toBe("pic.jpg");
      expect(body.data.file_type).toBe("image/jpeg");
      // Base64 payload is present and non-empty
      expect(typeof body.data.file_data_base64).toBe("string");
      expect(body.data.file_data_base64.length).toBeGreaterThan(0);
    });

    it("uploadDMFile alias returns the same shape (back-compat)", async () => {
      invokeMock.mockResolvedValueOnce({
        data: { success: true, path: "p", url: "u", file_name: "f.jpg", mime_type: "image/jpeg" },
        error: null,
      });
      const { uploadDMFile } = await import("../directMessageService");
      const res = await uploadDMFile(fakeFile("f.jpg", "image/jpeg"), "ignored-sender");
      expect(res).toEqual({ url: "u", fileName: "f.jpg", fileType: "image/jpeg" });
    });

    it("propagates backend error messages (e.g. mime/size rejection)", async () => {
      invokeMock.mockResolvedValueOnce({
        data: { error: "Unsupported mime type: application/x-msdownload" },
        error: null,
      });
      const { uploadChatAttachment } = await import("../directMessageService");
      await expect(
        uploadChatAttachment(fakeFile("evil.exe", "application/x-msdownload")),
      ).rejects.toThrow(/Unsupported mime type/);
    });
  });

  describe("read + archive + unread", () => {
    it("markDMRead invokes mark_dm_read with sender_id", async () => {
      invokeMock.mockResolvedValueOnce({ data: { success: true }, error: null });
      const { markDMRead } = await import("../directMessageService");
      await markDMRead("u2");
      expect(invokeMock.mock.calls[0][1].body).toEqual({
        action: "mark_dm_read",
        data: { sender_id: "u2" },
      });
    });

    it("archiveDM invokes archive_dm with partner_id", async () => {
      invokeMock.mockResolvedValueOnce({ data: { success: true, archived_count: 4 }, error: null });
      const { archiveDM } = await import("../directMessageService");
      await archiveDM("u2");
      expect(invokeMock.mock.calls[0][1].body).toEqual({
        action: "archive_dm",
        data: { partner_id: "u2" },
      });
    });

    it("fetchUnreadDMCount returns numeric count", async () => {
      invokeMock.mockResolvedValueOnce({ data: { count: 9 }, error: null });
      const { fetchUnreadDMCount } = await import("../directMessageService");
      expect(await fetchUnreadDMCount(["me"])).toBe(9);
      expect(invokeMock.mock.calls[0][1].body.action).toBe("get_unread_dm_count");
    });

    it("fetchUnreadDMCount returns 0 on error (no throw)", async () => {
      invokeMock.mockResolvedValueOnce({ data: null, error: new Error("x") });
      const { fetchUnreadDMCount } = await import("../directMessageService");
      expect(await fetchUnreadDMCount(["me"])).toBe(0);
    });
  });

  describe("fetchDMInboxGrouped + fetchDMInbox", () => {
    it("returns grouped conversations with unread + sentByMe flags", async () => {
      invokeMock.mockResolvedValueOnce({
        data: {
          conversations: [
            { recipientId: "u2", recipientName: "Anna", lastMessage: "Hej!", lastTimestamp: "2026-01-01T10:00:00Z", unreadCount: 2, isSentByMe: false },
            { recipientId: "u3", recipientName: "Bertil", lastMessage: "OK", lastTimestamp: "2026-01-01T09:00:00Z", unreadCount: 0, isSentByMe: true },
          ],
        },
        error: null,
      });
      const { fetchDMInboxGrouped } = await import("../directMessageService");
      const res = await fetchDMInboxGrouped(["me"]);
      expect(res).toHaveLength(2);
      expect(res[0].unreadCount).toBe(2);
      expect(res[1].isSentByMe).toBe(true);
    });

    it("fetchDMInbox derives a flat preview list from grouped backend data", async () => {
      invokeMock.mockResolvedValueOnce({
        data: {
          conversations: [
            { recipientId: "u2", recipientName: "Anna", lastMessage: "Hej!", lastTimestamp: "2026-01-01T10:00:00Z", unreadCount: 2, isSentByMe: false },
          ],
        },
        error: null,
      });
      const { fetchDMInbox } = await import("../directMessageService");
      const res = await fetchDMInbox(["me"]);
      expect(res).toHaveLength(1);
      // is_read mirrors unreadCount===0
      expect(res[0].is_read).toBe(false);
      expect(res[0].content).toBe("Hej!");
      expect(res[0].sender_id).toBe("u2"); // not sent by me → sender = partner
    });
  });
});
