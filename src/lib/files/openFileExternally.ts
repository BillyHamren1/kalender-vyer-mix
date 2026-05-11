/**
 * Open a remote file (PDF, image, doc, …) reliably.
 *
 * Many adblockers (uBlock Origin, Brave Shields, AdGuard) block direct
 * navigation to *.supabase.co with ERR_BLOCKED_BY_CLIENT. To dodge this we
 * fetch the file as a Blob and open a same-origin blob: URL — the extension
 * never sees the storage domain.
 *
 * Falls back to direct navigation if fetch fails (CORS, offline, etc).
 */
export async function openFileExternally(url: string, fileName?: string): Promise<void> {
  if (!url) return;

  // On native (Capacitor) WKWebView/Android WebView, window.open() is unreliable
  // (especially for blob: URLs and PDFs). Use the in-app Browser plugin instead.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "fullscreen" });
      return;
    }
  } catch {
    // fall through to web behaviour
  }

  // Try blob strategy first (bypasses adblockers blocking *.supabase.co)
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Pop out of iframe if needed
      const target =
        typeof window !== "undefined" && window.top && window.top !== window.self
          ? window.top
          : window;

      try {
        const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          target.location.href = blobUrl;
        }
      } catch {
        target.location.href = blobUrl;
      }

      // Revoke after a delay so the new tab has time to load
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return;
    }
  } catch {
    // fall through to direct navigation
  }

  // Fallback: direct navigation
  try {
    if (typeof window !== "undefined" && window.top && window.top !== window.self) {
      try {
        window.top.location.href = url;
        return;
      } catch {
        /* cross-origin top */
      }
    }
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) return;
    window.location.href = url;
  } catch {
    /* no-op */
  }
}
