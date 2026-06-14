/**
 * Generates a printable HTML version of the packing list with:
 *  - a checkbox per product row (also per quantity unit)
 *  - a signature line per row (initials)
 *  - header with packing name, booking number, client, date
 *  - opens in a new window and triggers print (user can "Save as PDF")
 */

export interface PrintablePackingRow {
  name: string;
  sku?: string | null;
  quantity: number;
  isChild?: boolean;
  groupLabel?: string | null;
}

export interface PrintablePackingMeta {
  packingName: string;
  bookingNumber?: string | null;
  client?: string | null;
  rigDate?: string | null;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );

const renderUnitBoxes = (qty: number): string => {
  // Render one tiny check-box per unit, max 30 per row (then collapse).
  const max = Math.min(qty, 30);
  let html = '';
  for (let i = 0; i < max; i++) {
    html += '<span class="unit-box"></span>';
  }
  if (qty > max) {
    html += `<span class="unit-extra">+${qty - max}</span>`;
  }
  return html;
};

export function openPrintablePackingList(
  meta: PrintablePackingMeta,
  rows: PrintablePackingRow[]
): void {
  // Group by groupLabel (booking) while preserving order.
  const groups = new Map<string, PrintablePackingRow[]>();
  for (const row of rows) {
    const key = row.groupLabel || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const today = new Date().toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalUnits = rows.reduce((sum, r) => sum + (r.quantity || 0), 0);

  const groupsHtml = Array.from(groups.entries())
    .map(([groupName, groupRows]) => {
      const rowsHtml = groupRows
        .map((row) => {
          const sku = row.sku ? `<div class="sku">[${escapeHtml(row.sku)}]</div>` : '';
          return `
            <tr class="${row.isChild ? 'child-row' : ''}">
              <td class="col-check"><span class="main-box"></span></td>
              <td class="col-name">
                <div class="name">${escapeHtml(row.name)}</div>
                ${sku}
              </td>
              <td class="col-qty">${row.quantity}</td>
              <td class="col-units">${renderUnitBoxes(row.quantity)}</td>
              <td class="col-sign"></td>
            </tr>
          `;
        })
        .join('');

      const groupHeader = groupName
        ? `<tr class="group-header"><td colspan="5">${escapeHtml(groupName)}</td></tr>`
        : '';

      return `${groupHeader}${rowsHtml}`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Packlista — ${escapeHtml(meta.packingName)}</title>
  <style>
    @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #111;
      font-size: 11px;
      margin: 0;
      padding: 16px;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #111;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
    .header .meta { font-size: 11px; color: #444; text-align: right; }
    .header .meta div { margin-top: 2px; }
    .summary {
      display: flex;
      gap: 24px;
      font-size: 11px;
      margin-bottom: 10px;
      color: #444;
    }
    .summary b { color: #111; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #555;
      border-bottom: 1px solid #888;
      padding: 6px 4px;
      background: #f6f6f6;
    }
    tbody td {
      padding: 8px 4px;
      border-bottom: 1px solid #ddd;
      vertical-align: top;
    }
    .col-check { width: 24px; }
    .col-name  { }
    .col-qty   { width: 36px; text-align: center; font-weight: 600; }
    .col-units { width: 38%; }
    .col-sign  { width: 22%; border-bottom: 1px solid #ddd; }
    .name { font-weight: 600; }
    .sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
           font-size: 10px; color: #666; margin-top: 2px; }
    .child-row .name { font-weight: 400; padding-left: 14px; color: #333; }
    .group-header td {
      background: #eef3f5;
      font-weight: 700;
      padding: 6px 8px;
      font-size: 12px;
      border-top: 2px solid #111;
      border-bottom: 1px solid #888;
    }
    .main-box {
      display: inline-block;
      width: 14px; height: 14px;
      border: 1.5px solid #111;
      border-radius: 3px;
      vertical-align: middle;
    }
    .unit-box {
      display: inline-block;
      width: 11px; height: 11px;
      border: 1px solid #555;
      border-radius: 2px;
      margin: 1px 2px 1px 0;
      vertical-align: middle;
    }
    .unit-extra {
      font-size: 10px;
      color: #555;
      padding-left: 4px;
    }
    .col-sign::after {
      content: "";
      display: block;
    }
    .footer {
      margin-top: 22px;
      display: flex;
      gap: 24px;
      font-size: 11px;
    }
    .footer .sign-block {
      flex: 1;
      border-top: 1px solid #111;
      padding-top: 4px;
    }
    .toolbar {
      position: fixed;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 8px;
    }
    .toolbar button {
      font: inherit;
      padding: 6px 12px;
      border: 1px solid #111;
      background: #111;
      color: #fff;
      border-radius: 4px;
      cursor: pointer;
    }
    .toolbar button.secondary {
      background: #fff;
      color: #111;
    }
    @media print {
      .toolbar { display: none; }
      body { padding: 0; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Skriv ut / Spara som PDF</button>
    <button class="secondary" onclick="window.close()">Stäng</button>
  </div>

  <div class="header">
    <div>
      <h1>${escapeHtml(meta.packingName)}</h1>
      <div style="font-size:11px;color:#555;margin-top:4px;">Packlista</div>
    </div>
    <div class="meta">
      ${meta.client ? `<div><b>Kund:</b> ${escapeHtml(meta.client)}</div>` : ''}
      ${meta.bookingNumber ? `<div><b>Bokning:</b> #${escapeHtml(meta.bookingNumber)}</div>` : ''}
      ${meta.rigDate ? `<div><b>Riggdatum:</b> ${escapeHtml(meta.rigDate)}</div>` : ''}
      <div><b>Utskrivet:</b> ${escapeHtml(today)}</div>
    </div>
  </div>

  <div class="summary">
    <div><b>${rows.length}</b> produktrader</div>
    <div><b>${totalUnits}</b> enheter totalt</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-check"></th>
        <th class="col-name">Produkt</th>
        <th class="col-qty">Antal</th>
        <th class="col-units">Per enhet</th>
        <th class="col-sign">Signatur</th>
      </tr>
    </thead>
    <tbody>
      ${groupsHtml}
    </tbody>
  </table>

  <div class="footer">
    <div class="sign-block">
      <div><b>Packad av</b></div>
      <div style="margin-top:18px;color:#666;">Namn / signatur</div>
    </div>
    <div class="sign-block">
      <div><b>Kontrollerad av</b></div>
      <div style="margin-top:18px;color:#666;">Namn / signatur</div>
    </div>
    <div class="sign-block">
      <div><b>Datum</b></div>
      <div style="margin-top:18px;color:#666;">_______________</div>
    </div>
  </div>

  <script>
    // Auto-open print dialog on load (user can cancel and use button).
    window.addEventListener('load', () => {
      setTimeout(() => { try { window.print(); } catch (e) {} }, 250);
    });
  </script>
</body>
</html>`;

  // Use a hidden iframe — works reliably across browsers without popup blockers.
  const existing = document.getElementById('packing-print-iframe');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'packing-print-iframe';
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
    } catch (e) {
      console.error('[printPackingList] print failed', e);
    }
  };

  // Wait for iframe content to load before printing.
  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(triggerPrint, 200);
  } else {
    iframe.addEventListener('load', () => setTimeout(triggerPrint, 200), { once: true });
  }
}
