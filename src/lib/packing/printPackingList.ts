/**
 * Generates a printable PDF packing list using jsPDF + autoTable.
 *
 * Bygger PDF:n direkt klient-sidigt (ingen window.print → ingen URL/sidnummer
 * från browser chrome). Öppnar i ny flik som blob så användaren kan spara/printa.
 *
 * Layout:
 *  - Modern header med projektnamn + meta-kolumn
 *  - Färgad accent-list
 *  - Kompakt tabell: Produkt | Antal | Check 1 | Sign | Check 2 | Sign
 *  - Group-headers per bokning
 *  - Footer-block för signaturer
 */
import jsPDF from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';

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

// Accent + ink color
const INK: [number, number, number] = [17, 24, 39];        // slate-900
const MUTED: [number, number, number] = [107, 114, 128];   // slate-500
const ACCENT: [number, number, number] = [37, 99, 235];    // blue-600
const GROUP_BG: [number, number, number] = [241, 245, 249]; // slate-100
const ZEBRA: [number, number, number] = [249, 250, 251];    // slate-50
const RULE: [number, number, number] = [226, 232, 240];     // slate-200

export function openPrintablePackingList(
  meta: PrintablePackingMeta,
  rows: PrintablePackingRow[]
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const today = new Date().toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const totalUnits = rows.reduce((sum, r) => sum + (r.quantity || 0), 0);

  // ─── Header ────────────────────────────────────────────────────────────────
  // Accent bar
  doc.setFillColor(...ACCENT);
  doc.rect(marginX, 14, 3, 18, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(meta.packingName, marginX + 7, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('PACKLISTA', marginX + 7, 27);

  // Meta block (right aligned)
  const metaLines: Array<[string, string]> = [];
  if (meta.client) metaLines.push(['Kund', meta.client]);
  if (meta.bookingNumber) metaLines.push(['Bokning', `#${meta.bookingNumber}`]);
  if (meta.rigDate) metaLines.push(['Riggdatum', meta.rigDate]);
  metaLines.push(['Utskrivet', today]);

  doc.setFontSize(9);
  let metaY = 17;
  metaLines.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    const labelText = `${label}:`;
    const labelW = doc.getTextWidth(labelText);
    const valueW = doc.getTextWidth(value);
    const lineX = pageW - marginX - valueW;
    doc.text(labelText, lineX - 2 - labelW, metaY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(value, pageW - marginX, metaY, { align: 'right' });
    metaY += 4.2;
  });

  // Divider
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(marginX, 36, pageW - marginX, 36);

  // Summary chips
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(
    `${rows.length} produktrader  ·  ${totalUnits} enheter totalt`,
    marginX,
    42
  );

  // ─── Bygg tabell-rader (med group headers som spann-rad) ──────────────────
  const groups = new Map<string, PrintablePackingRow[]>();
  for (const row of rows) {
    const key = row.groupLabel || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const body: RowInput[] = [];
  groups.forEach((groupRows, groupName) => {
    if (groupName) {
      body.push([
        {
          content: groupName,
          colSpan: 6,
          styles: {
            fillColor: GROUP_BG,
            textColor: INK,
            fontStyle: 'bold',
            fontSize: 10,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          },
        },
      ]);
    }
    groupRows.forEach((row) => {
      const nameCell = row.sku
        ? `${row.name}\n${row.sku}`
        : row.name;
      body.push([
        {
          content: nameCell,
          styles: {
            fontStyle: row.isChild ? 'normal' : 'bold',
            cellPadding: { top: 2, bottom: 2, left: row.isChild ? 6 : 3, right: 2 },
          },
        },
        { content: String(row.quantity), styles: { halign: 'center', fontStyle: 'bold' } },
        '', // check 1
        '', // sign 1
        '', // check 2
        '', // sign 2
      ]);
    });
  });

  autoTable(doc, {
    startY: 46,
    head: [['Produkt', 'Antal', 'Check 1', 'Sign', 'Check 2', 'Sign']],
    body,
    margin: { left: marginX, right: marginX, bottom: 22 },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: INK,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: RULE,
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 8,
      textColor: MUTED,
      fillColor: [255, 255, 255],
      lineWidth: { top: 0, bottom: 0.5, left: 0, right: 0 },
      lineColor: INK,
      cellPadding: { top: 2, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 22 },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 22 },
    },
    didParseCell: (data) => {
      // SKU subtle styling: jsPDF doesn't support per-line styling out of the box,
      // so we keep SKU on its own line but use a tiny muted font for the whole cell
      // only when name+sku — handled by simply showing both lines plainly.
    },
    didDrawCell: (data) => {
      // Render checkbox squares in Check 1 / Check 2 cells (body only)
      if (
        data.section === 'body' &&
        (data.column.index === 2 || data.column.index === 4) &&
        // skip group-header spanned rows
        typeof (data.row.raw as any)?.[0] !== 'object' || !((data.row.raw as any)?.[0]?.colSpan)
      ) {
        const isGroupRow =
          Array.isArray(data.row.raw) &&
          (data.row.raw as any)[0] &&
          typeof (data.row.raw as any)[0] === 'object' &&
          (data.row.raw as any)[0].colSpan;
        if (isGroupRow) return;

        const size = 4;
        const cx = data.cell.x + data.cell.width / 2 - size / 2;
        const cy = data.cell.y + data.cell.height / 2 - size / 2;
        doc.setDrawColor(...INK);
        doc.setLineWidth(0.4);
        doc.roundedRect(cx, cy, size, size, 0.6, 0.6, 'S');
      }
      // Underline for signature columns
      if (
        data.section === 'body' &&
        (data.column.index === 3 || data.column.index === 5)
      ) {
        const isGroupRow =
          Array.isArray(data.row.raw) &&
          (data.row.raw as any)[0] &&
          typeof (data.row.raw as any)[0] === 'object' &&
          (data.row.raw as any)[0].colSpan;
        if (isGroupRow) return;
        const y = data.cell.y + data.cell.height - 1.6;
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(data.cell.x + 1.5, y, data.cell.x + data.cell.width - 1.5, y);
      }
    },
    didDrawPage: () => {
      // Footer: page number + brand line (NO URL)
      const pageCurrent = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(
        `Packlista · ${meta.packingName}`,
        marginX,
        pageH - 8
      );
      doc.text(`Sida ${pageCurrent}`, pageW - marginX, pageH - 8, { align: 'right' });
    },
  });

  // ─── Signatur-block (på sista sidan, under tabell om plats) ───────────────
  const finalY = (doc as any).lastAutoTable?.finalY ?? 60;
  let sigY = finalY + 10;
  if (sigY > pageH - 40) {
    doc.addPage();
    sigY = 24;
  }

  const blockW = (pageW - marginX * 2 - 12) / 3;
  const blocks: Array<[string, string]> = [
    ['Packad av', 'Namn / signatur'],
    ['Kontrollerad av', 'Namn / signatur'],
    ['Datum', ''],
  ];
  blocks.forEach(([label, sub], i) => {
    const x = marginX + i * (blockW + 6);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.line(x, sigY + 14, x + blockW, sigY + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(label, x, sigY + 19);
    if (sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(sub, x, sigY + 23);
    }
  });

  // ─── Spara PDF:en direkt (ny flik blockeras ofta av ad-blockers på blob:) ──
  const safeName = meta.packingName.replace(/[^a-z0-9-_åäöÅÄÖ ]+/gi, '_').trim();
  const filename = `Packlista - ${safeName || 'lista'}.pdf`;
  doc.save(filename);
}

