/**
 * useUnknownPlaceAi
 * ─────────────────────────────────────────────────────────────────────────────
 * När en rad i tidrapporten klassats som `unknown_place` men det finns GPS-pings
 * i fönstret, kör befintliga `analyze-unclear-segment` AI:n och returnera
 * resultatet. Ingen klassningsändring — bara presentation.
 *
 * - Aktiveras endast om kind === 'unknown_place' och båda ISO finns.
 * - Hämtar dagens pings en gång (cache per staff+date) och filtrerar per fönster.
 * - Om inga pings: status='no_pings', edge function kallas inte.
 * - segment_id är deterministiskt → edge function cachear i DB.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "loading" | "no_pings" | "ready" | "error";

export interface UnknownPlaceAiResult {
  status: Status;
  label?: string;
  confidence?: number;
  explanation?: string;
  suggestedType?: "other_place" | "transport" | "needs_user_input";
  userQuestion?: string;
  pingCount?: number;
  centerLat?: number;
  centerLng?: number;
  errorMessage?: string;
}

interface Ping { lat: number; lng: number; recorded_at: string }

function useDayPings(staffId: string | null, date: string | null) {
  return useQuery({
    queryKey: ["unknown-place-ai-pings", staffId, date],
    enabled: !!staffId && !!date,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Ping[]> => {
      if (!staffId || !date) return [];
      const start = `${date}T00:00:00.000Z`;
      // include +1 day to cover local-time spillover
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 2);
      const end = next.toISOString();
      const { data, error } = await supabase
        .from("staff_location_history")
        .select("lat,lng,recorded_at")
        .eq("staff_id", staffId)
        .gte("recorded_at", start)
        .lt("recorded_at", end)
        .order("recorded_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Ping[];
    },
  });
}

interface Params {
  staffId: string | null;
  date: string | null;
  kind: string;
  startIso: string | null;
  endIso: string | null;
  enabled?: boolean;
}

export function useUnknownPlaceAi(params: Params): UnknownPlaceAiResult {
  const { staffId, date, kind, startIso, endIso, enabled = true } = params;
  const active =
    enabled &&
    !!staffId &&
    !!date &&
    !!startIso &&
    !!endIso &&
    kind === "unknown_place";

  const pingsQ = useDayPings(active ? staffId : null, active ? date : null);

  const segment = useMemo(() => {
    if (!active || !pingsQ.data) return null;
    const s = new Date(startIso!).getTime();
    const e = new Date(endIso!).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    const inside = pingsQ.data.filter((p) => {
      const t = new Date(p.recorded_at).getTime();
      return t >= s && t <= e && Number.isFinite(p.lat) && Number.isFinite(p.lng);
    });
    if (inside.length === 0) return { empty: true as const };
    const lat = inside.reduce((a, p) => a + p.lat, 0) / inside.length;
    const lng = inside.reduce((a, p) => a + p.lng, 0) / inside.length;
    const duration_min = Math.max(1, Math.round((e - s) / 60000));
    const segment_id = `${staffId}:${startIso}:${endIso}:unknown_place`;
    return {
      empty: false as const,
      segment_id,
      start_ts: startIso!,
      end_ts: endIso!,
      duration_min,
      center_lat: lat,
      center_lng: lng,
      ping_count: inside.length,
    };
  }, [active, pingsQ.data, startIso, endIso, staffId]);

  const aiQ = useQuery({
    queryKey: [
      "unknown-place-ai",
      staffId,
      segment && !segment.empty ? segment.segment_id : null,
    ],
    enabled: !!segment && !segment.empty,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      if (!segment || segment.empty) throw new Error("no_segment");
      const { data, error } = await supabase.functions.invoke(
        "analyze-unclear-segment",
        {
          body: {
            staff_id: staffId,
            date,
            segment: {
              segment_id: segment.segment_id,
              kind: "other_place",
              start_ts: segment.start_ts,
              end_ts: segment.end_ts,
              duration_min: segment.duration_min,
              center_lat: segment.center_lat,
              center_lng: segment.center_lng,
              is_stationary: true,
              ping_count: segment.ping_count,
            },
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      return (data as any)?.result as {
        suggestedType: "other_place" | "transport" | "needs_user_input";
        confidence: number;
        explanation: string;
        needsUserInput: boolean;
        userQuestion?: string;
      };
    },
  });

  if (!active) return { status: "idle" };
  if (pingsQ.isLoading) return { status: "loading" };
  if (segment && segment.empty) return { status: "no_pings" };
  if (aiQ.isLoading || aiQ.isFetching) return { status: "loading" };
  if (aiQ.error) {
    return { status: "error", errorMessage: String((aiQ.error as Error)?.message ?? aiQ.error) };
  }
  if (!aiQ.data) return { status: "loading" };

  const label = buildLabel(aiQ.data.explanation, aiQ.data.suggestedType);
  return {
    status: "ready",
    label,
    confidence: aiQ.data.confidence,
    explanation: aiQ.data.explanation,
    suggestedType: aiQ.data.suggestedType,
    userQuestion: aiQ.data.userQuestion,
    pingCount: segment && !segment.empty ? segment.ping_count : undefined,
    centerLat: segment && !segment.empty ? segment.center_lat : undefined,
    centerLng: segment && !segment.empty ? segment.center_lng : undefined,
  };
}

function buildLabel(
  explanation: string,
  suggestedType: "other_place" | "transport" | "needs_user_input",
): string {
  const trimmed = (explanation || "").trim();
  // Plocka första meningen som kort etikett
  const firstSentence = trimmed.split(/(?<=[.!?])\s/)[0]?.trim() || trimmed;
  const short = firstSentence.length > 90 ? firstSentence.slice(0, 87) + "…" : firstSentence;
  if (!short) {
    if (suggestedType === "transport") return "Trolig resa";
    if (suggestedType === "needs_user_input") return "Okänd plats – behöver bekräftas";
    return "Okänd plats";
  }
  return short;
}
