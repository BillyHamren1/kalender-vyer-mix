export function openPdfPreviewShell(title: string): Window | null {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) return null;

  try {
    previewWindow.document.title = title;
    previewWindow.document.body.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #0f172a;">
        Genererar PDF
      </div>
    `;
  } catch {
    // Ignore cross-window DOM access issues; we'll still try to navigate it later.
  }

  return previewWindow;
}

export function presentPdfBlob(
  previewWindow: Window | null,
  blob: Blob,
  filename: string,
): void {
  const url = URL.createObjectURL(blob);

  try {
    if (previewWindow && !previewWindow.closed) {
      previewWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
  } catch {
    // Fall through to secondary open/download path.
  }

  const secondaryWindow = window.open(url, '_blank');
  if (!secondaryWindow) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}