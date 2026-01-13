import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Trash2, ExternalLink, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { ProjectQuote, ProjectInvoice } from '@/types/projectEconomy';
import { AddQuoteDialog } from './AddQuoteDialog';
import { AddInvoiceDialog } from './AddInvoiceDialog';

interface QuotesInvoicesListProps {
  quotes: ProjectQuote[];
  invoices: ProjectInvoice[];
  projectId: string;
  onAddQuote: (quote: Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>) => void;
  onRemoveQuote: (id: string) => void;
  onAddInvoice: (invoice: Omit<ProjectInvoice, 'id' | 'created_at'>) => void;
  onRemoveInvoice: (id: string) => void;
  onUpdateInvoice: (data: { id: string; updates: Partial<ProjectInvoice> }) => void;
}

export const QuotesInvoicesList = ({
  quotes,
  invoices,
  projectId,
  onAddQuote,
  onRemoveQuote,
  onAddInvoice,
  onRemoveInvoice,
  onUpdateInvoice
}: QuotesInvoicesListProps) => {
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedQuoteForInvoice, setSelectedQuoteForInvoice] = useState<ProjectQuote | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getQuoteStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Godkänd</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800">Avvisad</Badge>;
      case 'invoiced':
        return <Badge className="bg-blue-100 text-blue-800">Fakturerad</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Väntande</Badge>;
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Betald</Badge>;
      case 'disputed':
        return <Badge className="bg-red-100 text-red-800">Tvist</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Obetald</Badge>;
    }
  };

  const getInvoiceForQuote = (quoteId: string) => {
    return invoices.find(inv => inv.quote_id === quoteId);
  };

  const getDeviationDisplay = (quote: ProjectQuote) => {
    const invoice = getInvoiceForQuote(quote.id);
    if (!invoice) {
      return <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Väntar</span>;
    }
    
    const deviation = invoice.invoiced_amount - quote.quoted_amount;
    const deviationPercent = (deviation / quote.quoted_amount) * 100;
    
    if (Math.abs(deviation) < 1) {
      return <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> 0</span>;
    }
    
    if (deviation > 0) {
      return (
        <span className="text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          +{deviationPercent.toFixed(0)}%
        </span>
      );
    }
    
    return (
      <span className="text-green-600 flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        {deviationPercent.toFixed(0)}%
      </span>
    );
  };

  const handleAddInvoiceForQuote = (quote: ProjectQuote) => {
    setSelectedQuoteForInvoice(quote);
    setInvoiceDialogOpen(true);
  };

  const quotesTotal = quotes.reduce((sum, q) => sum + Number(q.quoted_amount), 0);
  const invoicesTotal = invoices.reduce((sum, i) => sum + Number(i.invoiced_amount), 0);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Offerter & Fakturor</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setInvoiceDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Ny faktura
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuoteDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ny offert
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {quotes.length > 0 || invoices.filter(i => !i.quote_id).length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leverantör</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="text-right">Offert</TableHead>
                    <TableHead className="text-right">Faktura</TableHead>
                    <TableHead className="text-center">Avvikelse</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => {
                    const invoice = getInvoiceForQuote(quote.id);
                    return (
                      <TableRow key={quote.id}>
                        <TableCell className="font-medium">{quote.supplier}</TableCell>
                        <TableCell>{quote.description}</TableCell>
                        <TableCell className="text-right">{formatCurrency(quote.quoted_amount)}</TableCell>
                        <TableCell className="text-right">
                          {invoice ? (
                            formatCurrency(invoice.invoiced_amount)
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-xs"
                              onClick={() => handleAddInvoiceForQuote(quote)}
                            >
                              + Lägg till
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {getDeviationDisplay(quote)}
                        </TableCell>
                        <TableCell className="text-center">
                          {invoice ? getInvoiceStatusBadge(invoice.status) : getQuoteStatusBadge(quote.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {quote.quote_file_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => window.open(quote.quote_file_url!, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => onRemoveQuote(quote.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Show invoices without quotes */}
                  {invoices.filter(i => !i.quote_id).map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.supplier}</TableCell>
                      <TableCell>{invoice.notes || 'Faktura'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">-</TableCell>
                      <TableCell className="text-right">{formatCurrency(invoice.invoiced_amount)}</TableCell>
                      <TableCell className="text-center text-muted-foreground">-</TableCell>
                      <TableCell className="text-center">
                        {getInvoiceStatusBadge(invoice.status)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onRemoveInvoice(invoice.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={2}>TOTALT</TableCell>
                    <TableCell className="text-right">{formatCurrency(quotesTotal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(invoicesTotal)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              Inga offerter eller fakturor registrerade
            </p>
          )}
        </CardContent>
      </Card>

      <AddQuoteDialog
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
        projectId={projectId}
        onAdd={onAddQuote}
      />

      <AddInvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={(open) => {
          setInvoiceDialogOpen(open);
          if (!open) setSelectedQuoteForInvoice(null);
        }}
        projectId={projectId}
        quotes={quotes}
        preselectedQuote={selectedQuoteForInvoice}
        onAdd={onAddInvoice}
      />
    </>
  );
};
