import { describe, it, expect, vi, beforeEach } from "vitest";

// jobChatService is a thin wrapper around supabase.functions.invoke('mobile-app-api', ...).
// We mock the supabase client to verify wire format + behaviour, including the
// "attachment-without-text" preview fallback that the backend emits.

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
  },
}));

describe("jobChatService", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  describe("fetchJobMessages", () => {
    it("returns empty array for missing bookingId without invoking backend", async () => {
      const { fetchJobMessages } = await import("../jobChatService");
      const res = await fetchJobMessages("");
      expect(res).toEqual([]);
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it("calls mobile-app-api get_job_messages and unwraps messages", async () => {
      invokeMock.mockResolvedValueOnce({
        data: { messages: [{ id: "m1", content: "Hej", booking_id: "b1" }] },
        error: null,
      });
      const { fetchJobMessages } = await import("../jobChatService");
      const res = await fetchJobMessages("b1");
      expect(res).toHaveLength(1);
      expect(invokeMock).toHaveBeenCalledWith(
        "mobile-app-api",
        expect.objectContaining({
          body: expect.objectContaining({
            action: "get_job_messages",
            data: expect.objectContaining({ booking_id: "b1" }),
          }),
        }),
      );
    });

    it("returns [] (no throw) on backend error — UI stays mounted", async () => {
      invokeMock.mockResolvedValueOnce({ data: null, error: new Error("boom") });
      const { fetchJobMessages } = await import("../jobChatService");
      const res = await fetchJobMessages("b1");
      expect(res).toEqual([]);
    });
  });

  describe("sendJobMessage", () => {
    it("supports the new (bookingId, content) signature", async () => {
      invokeMock.mockResolvedValueOnce({
        data: { success: true, message: { id: "m1", content: "Hej" } },
        error: null,
      });
      const { sendJobMessage } = await import("../jobChatService");
      const msg = await sendJobMessage("b1", "Hej");
      expect(msg?.id).toBe("m1");

      const body = invokeMock.mock.calls[0][1].body;
      expect(body.action).toBe("send_job_message");
      expect(body.data.booking_id).toBe("b1");
      expect(body.data.content).toBe("Hej");
    });

    it("supports the legacy (bookingId, senderId, senderName, senderRole, content) signature", async () => {
      invokeMock.mockResolvedValueOnce({
        data: { success: true, message: { id: "m1", content: "Legacy" } },
        error: null,
      });
      const { sendJobMessage } = await import("../jobChatService");
      const msg = await sendJobMessage("b1", "ignored-sender", "ignored-name", "staff", "Legacy");
      expect(msg?.id).toBe("m1");
      const body = invokeMock.mock.calls[0][1].body;
      expect(body.data.content).toBe("Legacy");
    });

    it("forwards attachment metadata for previews (file-only message)", async () => {
      // Preview fallback: backend stores '📎 <name>' as content when text is empty.
      invokeMock.mockResolvedValueOnce({
        data: {
          success: true,
          message: {
            id: "m1",
            content: "📎 photo.jpg",
            file_url: "https://cdn/x.jpg",
            file_name: "photo.jpg",
            file_type: "image/jpeg",
          },
        },
        error: null,
      });
      const { sendJobMessage } = await import("../jobChatService");
      const msg = await sendJobMessage("b1", "", undefined, undefined, undefined, {
        fileUrl: "https://cdn/x.jpg",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
      });
      expect(msg?.content?.startsWith("📎")).toBe(true);
      expect(msg?.file_url).toBe("https://cdn/x.jpg");

      const body = invokeMock.mock.calls[0][1].body;
      expect(body.data.file_url).toBe("https://cdn/x.jpg");
      expect(body.data.file_name).toBe("photo.jpg");
      expect(body.data.file_type).toBe("image/jpeg");
    });
  });

  describe("markJobRead + archiveJobConversation", () => {
    it("invokes the matching backend action", async () => {
      invokeMock
        .mockResolvedValueOnce({ data: { success: true, updated: 0 }, error: null })
        .mockResolvedValueOnce({ data: { success: true, archived_count: 5 }, error: null });

      const { markJobRead, archiveJobConversation } = await import("../jobChatService");
      await markJobRead("b1");
      await archiveJobConversation("b1");

      expect(invokeMock.mock.calls[0][1].body.action).toBe("mark_job_read");
      expect(invokeMock.mock.calls[1][1].body.action).toBe("archive_job_conversation");
    });
  });

  describe("fetchJobParticipants", () => {
    it("requires bookingId", async () => {
      const { fetchJobParticipants } = await import("../jobChatService");
      const res = await fetchJobParticipants("", "2026-01-01");
      expect(res).toEqual([]);
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it("returns participants from backend with role classification", async () => {
      invokeMock.mockResolvedValueOnce({
        data: {
          participants: [
            { id: "s1", name: "Anna", role: "team_leader" },
            { id: "u1", name: "Planner", role: "planner" },
          ],
        },
        error: null,
      });
      const { fetchJobParticipants } = await import("../jobChatService");
      const res = await fetchJobParticipants("b1", "2026-01-01");
      expect(res).toHaveLength(2);
      expect(res[0].role).toBe("team_leader");
      expect(res[1].role).toBe("planner");

      const body = invokeMock.mock.calls[0][1].body;
      expect(body.action).toBe("get_job_participants");
      expect(body.data).toEqual({ booking_id: "b1", date: "2026-01-01" });
    });
  });
});
