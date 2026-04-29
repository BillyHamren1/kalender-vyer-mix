import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  ProjectBudget,
  ProjectPurchase,
  ProjectQuote,
  ProjectInvoice,
  StaffTimeReport,
  EconomySummary,
} from '@/types/projectEconomy';

interface ExportData {
  projectName: string;
  budget: ProjectBudget | null;
  timeReports: StaffTimeReport[];
  purchases: ProjectPurchase[];
  quotes: ProjectQuote[];
  invoices: ProjectInvoice[];
  summary: EconomySummary;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount || 0);

const formatDate = (date: string | null): string => {
  if (!date) return '-';
  try {
    return format(new Date(date), 'yyyy-MM-dd', { locale: sv });
  } catch {
    return '-';
  }
};

const safeName = (name: string) => name.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').toLowerCase();

// ─────────────────────────────────────────────────────────────
// EXCEL (.xlsx) — flera flikar med riktiga celler/tal
// ─────────────────────────────────────────────────────────────
export const exportToExcel = (data: ExportData): void => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const wb = XLSX.utils.book_new();
  const s = data.summary;

  // 1) Sammanfattning
  const summaryRows: (string | number)[][] = [
    ['Ekonomisk sammanställning', data.projectName],
    ['Exporterad', today],
    [],
    ['Kategori', 'Budget (SEK)', 'Utfall (SEK)', 'Avvikelse (SEK)', 'Avvikelse %'],
    ['Personal', s.staffBudget, s.staffActual, s.staffDeviation, Number((s.staffDeviationPercent || 0).toFixed(1))],
    ['Inköp', '', s.purchasesTotal, '', ''],
    ['Offerter', s.quotesTotal, '', '', ''],
    ['Leverantörsfakturor', '', s.invoicesTotal, s.invoiceDeviation, ''],
    ['Produktkostnad (budget)', s.productCostBudget, '', '', ''],
    ['Produktintäkt (kund)', s.productRevenue, '', '', ''],
    [],
    ['TOTALT', s.totalBudget, s.totalActual, s.totalDeviation, Number((s.totalDeviationPercent || 0).toFixed(1))],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Sammanfattning');

  // 2) Budget
  if (data.budget) {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Budgeterade timmar', 'Timlön', 'Total budget'],
      [data.budget.budgeted_hours, data.budget.hourly_rate, s.staffBudget],
      [],
      ['Beskrivning', data.budget.description || ''],
    ]);
    ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Budget');
  }

  // 3) Personal & timmar
  if (data.timeReports.length > 0) {
    const rows: (string | number)[][] = [
      ['Personal', 'Timmar', 'Övertid', 'Timlön', 'Övertidslön', 'Total kostnad', 'Godkänt'],
      ...data.timeReports.map((r) => [
        r.staff_name,
        r.total_hours,
        r.overtime_hours,
        r.hourly_rate,
        r.overtime_rate,
        r.total_cost,
        r.approved ? 'Ja' : 'Nej',
      ]),
      [
        'TOTALT',
        data.timeReports.reduce((a, r) => a + r.total_hours, 0),
        data.timeReports.reduce((a, r) => a + r.overtime_hours, 0),
        '',
        '',
        s.staffActual,
        '',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Personal');
  }

  // 4) Inköp
  if (data.purchases.length > 0) {
    const rows: (string | number)[][] = [
      ['Datum', 'Beskrivning', 'Leverantör', 'Kategori', 'Belopp'],
      ...data.purchases.map((p) => [
        formatDate(p.purchase_date),
        p.description,
        p.supplier || '',
        p.category || '',
        p.amount,
      ]),
      ['', '', '', 'TOTALT', s.purchasesTotal],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 22 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Inköp');
  }

  // 5) Offerter
  if (data.quotes.length > 0) {
    const rows: (string | number)[][] = [
      ['Leverantör', 'Beskrivning', 'Offertdatum', 'Giltigt till', 'Belopp', 'Status'],
      ...data.quotes.map((q) => [
        q.supplier,
        q.description,
        formatDate(q.quote_date),
        formatDate(q.valid_until),
        q.quoted_amount,
        q.status,
      ]),
      ['', '', '', 'TOTALT', s.quotesTotal, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Offerter');
  }

  // 6) Fakturor
  if (data.invoices.length > 0) {
    const rows: (string | number)[][] = [
      ['Leverantör', 'Fakturanummer', 'Fakturadatum', 'Förfallodatum', 'Belopp', 'Status'],
      ...data.invoices.map((i) => [
        i.supplier,
        i.invoice_number || '',
        formatDate(i.invoice_date),
        formatDate(i.due_date),
        i.invoiced_amount,
        i.status,
      ]),
      ['', '', '', 'TOTALT', s.invoicesTotal, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Fakturor');
  }

  XLSX.writeFile(wb, `ekonomi-${safeName(data.projectName)}-${today}.xlsx`);
};

// ─────────────────────────────────────────────────────────────
// PDF — riktig nedladdningsbar PDF via jsPDF + autoTable
// ─────────────────────────────────────────────────────────────
export const exportToPDF = (data: ExportData): void => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const s = data.summary;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Ekonomisk sammanställning', 40, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${data.projectName}  •  Exporterad ${today}`, 40, 68);
  doc.setTextColor(0);

  // Sammanfattning
  autoTable(doc, {
    startY: 90,
    head: [['Kategori', 'Budget', 'Utfall', 'Avvikelse', 'Avvikelse %']],
    body: [
      ['Personal', formatCurrency(s.staffBudget), formatCurrency(s.staffActual), formatCurrency(s.staffDeviation), `${(s.staffDeviationPercent || 0).toFixed(1)}%`],
      ['Inköp', '-', formatCurrency(s.purchasesTotal), '-', '-'],
      ['Offerter', formatCurrency(s.quotesTotal), '-', '-', '-'],
      ['Leverantörsfakturor', '-', formatCurrency(s.invoicesTotal), formatCurrency(s.invoiceDeviation), '-'],
      ['Produktkostnad (budget)', formatCurrency(s.productCostBudget), '-', '-', '-'],
      ['Produktintäkt (kund)', formatCurrency(s.productRevenue), '-', '-', '-'],
      [
        { content: 'TOTALT', styles: { fontStyle: 'bold' } },
        { content: formatCurrency(s.totalBudget), styles: { fontStyle: 'bold' } },
        { content: formatCurrency(s.totalActual), styles: { fontStyle: 'bold' } },
        { content: formatCurrency(s.totalDeviation), styles: { fontStyle: 'bold' } },
        { content: `${(s.totalDeviationPercent || 0).toFixed(1)}%`, styles: { fontStyle: 'bold' } },
      ],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  });

  const sectionTitle = (title: string, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title, 40, y);
  };

  let cursor = (doc as any).lastAutoTable.finalY + 24;

  // Personal & timmar
  if (data.timeReports.length > 0) {
    sectionTitle('Personal & Timmar', cursor);
    autoTable(doc, {
      startY: cursor + 8,
      head: [['Personal', 'Timmar', 'Övertid', 'Timlön', 'Kostnad']],
      body: [
        ...data.timeReports.map((r) => [
          r.staff_name,
          `${r.total_hours} h`,
          `${r.overtime_hours} h`,
          formatCurrency(r.hourly_rate),
          formatCurrency(r.total_cost),
        ]),
        [
          { content: 'TOTALT', styles: { fontStyle: 'bold' } },
          { content: `${s.actualHours} h`, styles: { fontStyle: 'bold' } },
          '',
          '',
          { content: formatCurrency(s.staffActual), styles: { fontStyle: 'bold' } },
        ],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    });
    cursor = (doc as any).lastAutoTable.finalY + 24;
  }

  // Inköp
  if (data.purchases.length > 0) {
    if (cursor > 720) { doc.addPage(); cursor = 50; }
    sectionTitle('Inköp', cursor);
    autoTable(doc, {
      startY: cursor + 8,
      head: [['Datum', 'Beskrivning', 'Leverantör', 'Belopp']],
      body: [
        ...data.purchases.map((p) => [formatDate(p.purchase_date), p.description, p.supplier || '-', formatCurrency(p.amount)]),
        [{ content: 'TOTALT', colSpan: 3, styles: { fontStyle: 'bold' } }, { content: formatCurrency(s.purchasesTotal), styles: { fontStyle: 'bold' } }],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    });
    cursor = (doc as any).lastAutoTable.finalY + 24;
  }

  // Offerter
  if (data.quotes.length > 0) {
    if (cursor > 720) { doc.addPage(); cursor = 50; }
    sectionTitle('Offerter', cursor);
    autoTable(doc, {
      startY: cursor + 8,
      head: [['Leverantör', 'Beskrivning', 'Status', 'Belopp']],
      body: [
        ...data.quotes.map((q) => [q.supplier, q.description, q.status, formatCurrency(q.quoted_amount)]),
        [{ content: 'TOTALT', colSpan: 3, styles: { fontStyle: 'bold' } }, { content: formatCurrency(s.quotesTotal), styles: { fontStyle: 'bold' } }],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    });
    cursor = (doc as any).lastAutoTable.finalY + 24;
  }

  // Fakturor
  if (data.invoices.length > 0) {
    if (cursor > 720) { doc.addPage(); cursor = 50; }
    sectionTitle('Leverantörsfakturor', cursor);
    autoTable(doc, {
      startY: cursor + 8,
      head: [['Leverantör', 'Fakturanr', 'Status', 'Belopp']],
      body: [
        ...data.invoices.map((i) => [i.supplier, i.invoice_number || '-', i.status, formatCurrency(i.invoiced_amount)]),
        [{ content: 'TOTALT', colSpan: 3, styles: { fontStyle: 'bold' } }, { content: formatCurrency(s.invoicesTotal), styles: { fontStyle: 'bold' } }],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    });
  }

  // Sidfot med sidnummer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Sida ${i} av ${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }

  doc.save(`ekonomi-${safeName(data.projectName)}-${today}.pdf`);
};
