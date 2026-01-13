import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectInvoice, ProjectQuote } from '@/types/projectEconomy';

interface AddInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  quotes: ProjectQuote[];
  preselectedQuote?: ProjectQuote | null;
  onAdd: (invoice: Omit<ProjectInvoice, 'id' | 'created_at'>) => void;
}

export const AddInvoiceDialog = ({ 
  open, 
  onOpenChange, 
  projectId, 
  quotes, 
  preselectedQuote, 
  onAdd 
}: AddInvoiceDialogProps) => {
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoicedAmount, setInvoicedAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'unpaid' | 'paid' | 'disputed'>('unpaid');
  const [notes, setNotes] = useState('');
  const [invoiceFileUrl, setInvoiceFileUrl] = useState('');

  // Pre-fill when quote is selected
  useEffect(() => {
    if (preselectedQuote) {
      setQuoteId(preselectedQuote.id);
      setSupplier(preselectedQuote.supplier);
      setInvoicedAmount(preselectedQuote.quoted_amount.toString());
      setNotes(preselectedQuote.description);
    }
  }, [preselectedQuote]);

  const handleQuoteChange = (id: string) => {
    if (id === 'none') {
      setQuoteId(null);
      return;
    }
    
    const quote = quotes.find(q => q.id === id);
    if (quote) {
      setQuoteId(quote.id);
      setSupplier(quote.supplier);
      setInvoicedAmount(quote.quoted_amount.toString());
      setNotes(quote.description);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onAdd({
      project_id: projectId,
      quote_id: quoteId,
      supplier,
      invoice_number: invoiceNumber || null,
      invoiced_amount: parseFloat(invoicedAmount) || 0,
      invoice_date: invoiceDate || null,
      due_date: dueDate || null,
      status,
      invoice_file_url: invoiceFileUrl || null,
      notes: notes || null
    });

    // Reset form
    setQuoteId(null);
    setSupplier('');
    setInvoiceNumber('');
    setInvoicedAmount('');
    setInvoiceDate('');
    setDueDate('');
    setStatus('unpaid');
    setNotes('');
    setInvoiceFileUrl('');
    onOpenChange(false);
  };

  // Calculate deviation if linked to quote
  const linkedQuote = quoteId ? quotes.find(q => q.id === quoteId) : null;
  const deviation = linkedQuote && invoicedAmount 
    ? parseFloat(invoicedAmount) - linkedQuote.quoted_amount 
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrera faktura</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {quotes.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="quote">Koppla till offert (valfritt)</Label>
              <Select value={quoteId || 'none'} onValueChange={handleQuoteChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj offert..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen koppling</SelectItem>
                  {quotes.map((quote) => (
                    <SelectItem key={quote.id} value={quote.id}>
                      {quote.supplier} - {quote.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">Leverantör *</Label>
              <Input
                id="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="T.ex. Ljud & Ljus AB"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Fakturanummer</Label>
              <Input
                id="invoiceNumber"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="T.ex. 12345"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoicedAmount">Fakturerat belopp (kr) *</Label>
              <Input
                id="invoicedAmount"
                type="number"
                min="0"
                step="0.01"
                value={invoicedAmount}
                onChange={(e) => setInvoicedAmount(e.target.value)}
                placeholder="0"
                required
              />
              {deviation !== null && (
                <p className={`text-xs ${deviation > 0 ? 'text-red-600' : deviation < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {deviation > 0 ? '+' : ''}{deviation.toFixed(0)} kr vs offert
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Obetald</SelectItem>
                  <SelectItem value="paid">Betald</SelectItem>
                  <SelectItem value="disputed">Tvist</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Fakturadatum</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Förfallodatum</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Anteckningar</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Beskrivning eller kommentarer..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceFileUrl">Länk till faktura (valfritt)</Label>
            <Input
              id="invoiceFileUrl"
              type="url"
              value={invoiceFileUrl}
              onChange={(e) => setInvoiceFileUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!supplier || !invoicedAmount}>
              Lägg till
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
