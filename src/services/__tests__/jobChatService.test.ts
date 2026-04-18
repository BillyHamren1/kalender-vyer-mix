import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * jobChatService — thin legacy wrapper över `mobileApi` (mobile-app-api edge function).
 *
 * Tester här verifierar wire-format mellan wrappern och `mobileApi` genom att
 * mocka `fetch` (samma transport som mobileApiService använder). Den breda
 * produktnivå-täckningen finns i src/test/messagingProduct.contract.test.ts.
 */

describe("jobChatService", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    localStorage.clear();
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

  describe("fetchJobMessages", () => {
    it("returns [] when no bookingId is supplied (no backend call)", async () => {
      const { fetchJobMessages } = await import("../jobChatService");
      const res = await fetchJobMessages("");
      expect(res).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("calls mobile-app-api get_job_messages and unwraps messages", async () => {
      mockFetch.mockResolvedValueOnce(ok({ messages: [{ id: "m1", content: "Hej", booking_id: "b1" }], has_more: false, next_cursor: null }));
      const { fetchJobMessages } = await import("../jobChatService");
      const res = await fetchJobMessages("b1");
      expect(res).toHaveLength(1);
      const body = lastBody();
      expect(body.action).toBe("get_job_messages");
      expect(body.data.booking_id).toBe("b1");
    });

    it("returns [] (no throw) on backend error — UI stays mounted", async () => {
      mockFetch.mockResolvedValueOnce({ status: 503, ok: false, json: () => Promise.resolve({ error: "boom" }) });
      const { fetchJobMessages } = await import("../jobChatService");
      const res = await fetchJobMessages("b1");
      expect(res).toEqual([]);
    });
  });

  describe("sendJobMessage", () => {
    it("supports the new (bookingId, content) signature", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: { id: "m1", content: "Hej" } }));
      const { sendJobMessage } = await import("../jobChatService");
      const msg = await sendJobMessage("b1", "Hej");
      expect(msg?.id).toBe("m1");

      const body = lastBody();
      expect(body.action).toBe("send_job_message");
      expect(body.data).toMatchObject({ booking_id: "b1", content: "Hej" });
    });

    it("supports the legacy (bookingId, senderId, senderName, senderRole, content) signature", async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: { id: "m1", content: "Legacy" } }));
      const { sendJobMessage } = await import("../jobChatService");
      const msg = await sendJobMessage("b1", "ignored-sender", "ignored-name", "staff", "Legacy");
      expect(msg?.id).toBe("m1");
      const body = lastBody();
      expect(body.data.content).toBe("Legacy");
      // sender* args must NOT leak — backend resolves identity.
      expect(body.data.sender_id).toBeUndefined();
      expect(body.data.sender_name).toBeUndefined();
    });

    it("forwards attachment metadata for previews (file-only message)", async () => {
      mockFetch.mockResolvedValueOnce(ok({
        success: true,
        message: {
          id: "m1",
          content: "📎 photo.jpg",
          file_url: "https://cdn/x.jpg",
          file_name: "photo.jpg",
          file_type: "image/jpeg",
        },
      }));
      const { sendJobMessage } = await import("../jobChatService");
      const msg = await sendJobMessage("b1", "", undefined, undefined, undefined, {
        fileUrl: "https://cdn/x.jpg",
        fileName: "photo.jpg",
        fileType: "image/jpeg",
      });
      expect(msg?.content?.startsWith("📎")).toBe(true);
      expect(msg?.file_url).toBe("https://cdn/x.jpg");

      const body = lastBody();
      expect(body.data.file_url).toBe("https://cdn/x.jpg");
      expect(body.data.file_name).toBe("photo.jpg");
      expect(body.data.file_type).toBe("image/jpeg");
    });
  });

  describe("markJobRead + archiveJobConversation", () => {
    it("invokes the matching backend action", async () => {
      mockFetch
        .mockResolvedValueOnce(ok({ success: true, updated: 0 }))
        .mockResolvedValueOnce(ok({ success: true, archived_count: 5 }));

      const { markJobRead, archiveJobConversation } = await import("../jobChatService");
      await markJobRead("b1");
      await archiveJobConversation("b1");

      expect(JSON.parse((mockFetch.mock.calls[0][1] as any).body).action).toBe("mark_job_read");
      expect(JSON.parse((mockFetch.mock.calls[1][1] as any).body).action).toBe("archive_job_conversation");
    });
  });

  describe("fetchJobParticipants", () => {
    it("requires bookingId (returns [] without backend call)", async () => {
      const { fetchJobParticipants } = await import("../jobChatService");
      const res = await fetchJobParticipants("", "2026-01-01");
      expect(res).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns participants from backend with role classification", async () => {
      mockFetch.mockResolvedValueOnce(ok({
        participants: [
          { id: "s1", name: "Anna", role: "team_leader" },
          { id: "u1", name: "Planner", role: "planner" },
        ],
      }));
      const { fetchJobParticipants } = await import("../jobChatService");
      const res = await fetchJobParticipants("b1", "2026-01-01");
      expect(res).toHaveLength(2);
      expect(res[0].role).toBe("team_leader");
      expect(res[1].role).toBe("planner");

      const body = lastBody();
      expect(body.action).toBe("get_job_participants");
      expect(body.data).toEqual({ booking_id: "b1", date: "2026-01-01" });
    });
  });
});
