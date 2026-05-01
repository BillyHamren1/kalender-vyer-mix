import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the public Mapbox token from the `mapbox-token` edge function exactly
 * once per page load and caches it module-globally so multiple maps share it.
 */
let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

async function loadToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.functions.invoke("mapbox-token");
    if (error) throw error;
    const token = (data as any)?.token as string | undefined;
    if (!token) throw new Error("Mapbox-token saknas i svaret");
    cachedToken = token;
    return token;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export interface UseMapboxTokenResult {
  token: string | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useMapboxToken(): UseMapboxTokenResult {
  const [token, setToken] = useState<string | null>(cachedToken);
  const [loading, setLoading] = useState(!cachedToken);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (cachedToken) {
      setToken(cachedToken);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadToken()
      .then((t) => {
        if (cancelled) return;
        setToken(t);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || "Kunde inte hämta Mapbox-token");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { token, loading, error, retry: () => setTick((t) => t + 1) };
}
