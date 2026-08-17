export interface PrintableChecklistItem {
  title: string;
  completed?: boolean;
}

export interface PrintableChecklistMeta {
  title: string;
  packingName: string;
  bookingNumber?: string | null;
  client?: string | null;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!),
  );

export const openPrintableChecklist = (
  meta: PrintableChecklistMeta,
  items: PrintableChecklistItem[],
): void => {
  const printedAt = new Date().toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const rows = items
    .map((item) => `
      <tr>
        <td class="check"><span class="box">${item.completed ? '✓' : ''}</span></td>
        <td class="task ${item.completed ? 'done' : ''}">${escapeHtml(item.title)}</td>
        <td class="sign"></td>
      </tr>
    `)
    .join('');

  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.packingName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 12px; }
  .header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; gap: 24px; }
  h1 { font-size: 20px; margin: 0; }
  .sub { margin-top: 4px; color: #555; }
  .meta { text-align: right; color: #444; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; color: #555; background: #f3f4f6; border-bottom: 1px solid #777; padding: 7px 6px; }
  td { border-bottom: 1px solid #ddd; padding: 10px 6px; vertical-align: middle; }
  .check { width: 38px; text-align: center; }
  .box { display: inline-flex; width: 18px; height: 18px; border: 1.5px solid #111; border-radius: 3px; align-items: center; justify-content: center; font-weight: 700; }
  .task { font-weight: 600; }
  .task.done { color: #666; text-decoration: line-through; }
  .sign { width: 95px; }
  .sign::after { content: ''; display: block; border-bottom: 1px solid #888; height: 16px; }
  .footer { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  .footer > div { border-top: 1px solid #111; padding-top: 5px; color: #555; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(meta.title)}</h1>
      <div class="sub">${escapeHtml(meta.packingName)}</div>
    </div>
    <div class="meta">
      ${meta.client ? `<div><b>Kund:</b> ${escapeHtml(meta.client)}</div>` : ''}
      ${meta.bookingNumber ? `<div><b>Bokning:</b> #${escapeHtml(meta.bookingNumber)}</div>` : ''}
      <div><b>Utskrivet:</b> ${escapeHtml(printedAt)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th class="check">Klar</th><th>Kontrollpunkt</th><th class="sign">Sign</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">Inga checklistpunkter.</td></tr>'}</tbody>
  </table>
  <div class="footer">
    <div>Genomförd av / signatur</div>
    <div>Datum / tid</div>
  </div>
</body>
</html>`;

  const existing = document.getElementById('packing-checklist-print-iframe');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'packing-checklist-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (error) {
      console.error('[printChecklist] print failed', error);
    }
  };

  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(triggerPrint, 200);
  } else {
    iframe.addEventListener('load', () => setTimeout(triggerPrint, 200), { once: true });
  }
};
