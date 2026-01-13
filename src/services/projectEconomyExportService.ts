import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { 
  ProjectBudget, 
  ProjectPurchase, 
  ProjectQuote, 
  ProjectInvoice, 
  StaffTimeReport, 
  EconomySummary 
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

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);
};

const formatDate = (date: string | null): string => {
  if (!date) return '-';
  return format(new Date(date), 'yyyy-MM-dd', { locale: sv });
};

const escapeCSV = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const exportToExcel = (data: ExportData): void => {
  const lines: string[] = [];
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // Header
  lines.push(`Ekonomisk sammanställning - ${data.projectName}`);
  lines.push(`Exporterad: ${today}`);
  lines.push('');
  
  // Summary section
  lines.push('=== SAMMANFATTNING ===');
  lines.push('');
  lines.push('Kategori,Budget,Utfall,Avvikelse,Avvikelse %');
  lines.push(`Personal,${data.summary.staffBudget},${data.summary.staffActual},${data.summary.staffDeviation},${data.summary.staffDeviationPercent.toFixed(1)}%`);
  lines.push(`Inköp,-,${data.summary.purchasesTotal},-,-`);
  lines.push(`Offerter/Fakturor,${data.summary.quotesTotal},${data.summary.invoicesTotal},${data.summary.invoiceDeviation},-`);
  lines.push(`TOTALT,${data.summary.totalBudget},${data.summary.totalActual},${data.summary.totalDeviation},${data.summary.totalDeviationPercent.toFixed(1)}%`);
  lines.push('');
  
  // Budget section
  if (data.budget) {
    lines.push('=== BUDGET ===');
    lines.push('');
    lines.push('Budgeterade timmar,Timlön,Total budget');
    lines.push(`${data.budget.budgeted_hours},${data.budget.hourly_rate},${data.summary.staffBudget}`);
    lines.push('');
  }
  
  // Staff time reports
  if (data.timeReports.length > 0) {
    lines.push('=== PERSONAL & TIMMAR ===');
    lines.push('');
    lines.push('Personal,Timmar,Övertid,Timlön,Övertidslön,Total kostnad');
    data.timeReports.forEach(report => {
      lines.push([
        escapeCSV(report.staff_name),
        report.total_hours,
        report.overtime_hours,
        report.hourly_rate,
        report.overtime_rate,
        report.total_cost
      ].join(','));
    });
    lines.push('');
  }
  
  // Purchases
  if (data.purchases.length > 0) {
    lines.push('=== INKÖP ===');
    lines.push('');
    lines.push('Datum,Beskrivning,Leverantör,Kategori,Belopp');
    data.purchases.forEach(purchase => {
      lines.push([
        escapeCSV(formatDate(purchase.purchase_date)),
        escapeCSV(purchase.description),
        escapeCSV(purchase.supplier),
        escapeCSV(purchase.category),
        purchase.amount
      ].join(','));
    });
    lines.push(`,,,,TOTALT: ${data.summary.purchasesTotal}`);
    lines.push('');
  }
  
  // Quotes
  if (data.quotes.length > 0) {
    lines.push('=== OFFERTER ===');
    lines.push('');
    lines.push('Leverantör,Beskrivning,Offertdatum,Giltigt till,Belopp,Status');
    data.quotes.forEach(quote => {
      lines.push([
        escapeCSV(quote.supplier),
        escapeCSV(quote.description),
        escapeCSV(formatDate(quote.quote_date)),
        escapeCSV(formatDate(quote.valid_until)),
        quote.quoted_amount,
        escapeCSV(quote.status)
      ].join(','));
    });
    lines.push(`,,,,TOTALT: ${data.summary.quotesTotal},`);
    lines.push('');
  }
  
  // Invoices
  if (data.invoices.length > 0) {
    lines.push('=== FAKTUROR ===');
    lines.push('');
    lines.push('Leverantör,Fakturanummer,Fakturadatum,Förfallodatum,Belopp,Status');
    data.invoices.forEach(invoice => {
      lines.push([
        escapeCSV(invoice.supplier),
        escapeCSV(invoice.invoice_number),
        escapeCSV(formatDate(invoice.invoice_date)),
        escapeCSV(formatDate(invoice.due_date)),
        invoice.invoiced_amount,
        escapeCSV(invoice.status)
      ].join(','));
    });
    lines.push(`,,,,TOTALT: ${data.summary.invoicesTotal},`);
  }
  
  // Create and download file
  const csvContent = lines.join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ekonomi-${data.projectName.replace(/\s+/g, '-').toLowerCase()}-${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToPDF = (data: ExportData): void => {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // Create printable HTML content
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="sv">
    <head>
      <meta charset="UTF-8">
      <title>Ekonomisk sammanställning - ${data.projectName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #333; padding: 20mm; }
        h1 { font-size: 18pt; margin-bottom: 5mm; color: #1a1a1a; }
        h2 { font-size: 13pt; margin: 8mm 0 4mm 0; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 2mm; }
        .meta { color: #666; font-size: 10pt; margin-bottom: 10mm; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 5mm; }
        th, td { padding: 2mm 3mm; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f5f5f5; font-weight: 600; font-size: 10pt; }
        td { font-size: 10pt; }
        .amount { text-align: right; }
        .total-row { font-weight: 600; background: #f9f9f9; }
        .summary-card { display: flex; gap: 10mm; margin-bottom: 8mm; }
        .summary-item { flex: 1; padding: 4mm; background: #f5f5f5; border-radius: 2mm; }
        .summary-label { font-size: 9pt; color: #666; }
        .summary-value { font-size: 14pt; font-weight: 600; margin-top: 1mm; }
        .positive { color: #16a34a; }
        .negative { color: #dc2626; }
        .warning { color: #ca8a04; }
        @media print { body { padding: 10mm; } }
      </style>
    </head>
    <body>
      <h1>Ekonomisk sammanställning</h1>
      <p class="meta">${data.projectName} • Exporterad ${today}</p>
      
      <div class="summary-card">
        <div class="summary-item">
          <div class="summary-label">Total budget</div>
          <div class="summary-value">${formatCurrency(data.summary.totalBudget)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Totalt utfall</div>
          <div class="summary-value">${formatCurrency(data.summary.totalActual)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Avvikelse</div>
          <div class="summary-value ${data.summary.totalDeviation > 0 ? 'negative' : data.summary.totalDeviation < 0 ? 'positive' : ''}">
            ${data.summary.totalDeviation > 0 ? '+' : ''}${formatCurrency(data.summary.totalDeviation)}
            (${data.summary.totalDeviationPercent.toFixed(1)}%)
          </div>
        </div>
      </div>
      
      ${data.timeReports.length > 0 ? `
        <h2>Personal & Timmar</h2>
        ${data.budget ? `<p style="margin-bottom: 3mm; font-size: 10pt; color: #666;">Budget: ${data.budget.budgeted_hours} tim × ${formatCurrency(data.budget.hourly_rate)}/tim = ${formatCurrency(data.summary.staffBudget)}</p>` : ''}
        <table>
          <thead>
            <tr>
              <th>Personal</th>
              <th class="amount">Timmar</th>
              <th class="amount">Övertid</th>
              <th class="amount">Kostnad</th>
            </tr>
          </thead>
          <tbody>
            ${data.timeReports.map(r => `
              <tr>
                <td>${r.staff_name}</td>
                <td class="amount">${r.total_hours} h</td>
                <td class="amount">${r.overtime_hours} h</td>
                <td class="amount">${formatCurrency(r.total_cost)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Totalt</td>
              <td class="amount">${data.summary.actualHours} h</td>
              <td class="amount"></td>
              <td class="amount">${formatCurrency(data.summary.staffActual)}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}
      
      ${data.purchases.length > 0 ? `
        <h2>Inköp</h2>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Beskrivning</th>
              <th>Leverantör</th>
              <th class="amount">Belopp</th>
            </tr>
          </thead>
          <tbody>
            ${data.purchases.map(p => `
              <tr>
                <td>${formatDate(p.purchase_date)}</td>
                <td>${p.description}</td>
                <td>${p.supplier || '-'}</td>
                <td class="amount">${formatCurrency(p.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3">Totalt</td>
              <td class="amount">${formatCurrency(data.summary.purchasesTotal)}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}
      
      ${data.quotes.length > 0 ? `
        <h2>Offerter</h2>
        <table>
          <thead>
            <tr>
              <th>Leverantör</th>
              <th>Beskrivning</th>
              <th>Status</th>
              <th class="amount">Belopp</th>
            </tr>
          </thead>
          <tbody>
            ${data.quotes.map(q => `
              <tr>
                <td>${q.supplier}</td>
                <td>${q.description}</td>
                <td>${q.status}</td>
                <td class="amount">${formatCurrency(q.quoted_amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3">Totalt offererat</td>
              <td class="amount">${formatCurrency(data.summary.quotesTotal)}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}
      
      ${data.invoices.length > 0 ? `
        <h2>Fakturor</h2>
        <table>
          <thead>
            <tr>
              <th>Leverantör</th>
              <th>Fakturanr</th>
              <th>Status</th>
              <th class="amount">Belopp</th>
            </tr>
          </thead>
          <tbody>
            ${data.invoices.map(i => `
              <tr>
                <td>${i.supplier}</td>
                <td>${i.invoice_number || '-'}</td>
                <td>${i.status}</td>
                <td class="amount">${formatCurrency(i.invoiced_amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3">Totalt fakturerat</td>
              <td class="amount">${formatCurrency(data.summary.invoicesTotal)}</td>
            </tr>
          </tbody>
        </table>
      ` : ''}
    </body>
    </html>
  `;
  
  // Open print dialog
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }
};
