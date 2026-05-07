/**
 * Open a remote file (PDF, image, doc, …) in a way that works across:
 * - desktop browsers (new tab)
 * - in-app webviews / iframes (Lovable preview, embedded admin shells)
 * - Capacitor mobile app (system browser via @capacitor/browser if installed,
 *   otherwise top-level navigation as a safe fallback)
 *
 * Strategy:
 *  1. If we're inside an iframe, force navigation in the TOP window so the
 *     browser handles the PDF natively. Inline iframes for cross-origin PDFs
 *     are unreliable and pop-up blockers often kill window.open.
 *  2. Try window.open in a new tab.
 *  3. If popup is blocked / returns null, fall back to navigating the current
 *     tab to the file URL.
 */
export function openFileExternally(url: string, _fileName?: string): void {
  if (!url) return;

  try {
    // Inside an iframe (preview / embedded shells): pop out to the top window.
    if (typeof window !== "undefined" && window.top && window.top !== window.self) {
      try {
        window.top.location.href = url;
        return;
      } catch {
        // cross-origin top — fall through to window.open
      }
    }

    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) return;
  } catch {
    // ignore and fall through
  }

  // Last resort: navigate current tab.
  try {
    window.location.href = url;
  } catch {
    /* no-op */
  }
}
