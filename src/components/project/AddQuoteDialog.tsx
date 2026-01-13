import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectQuote } from '@/types/projectEconomy';

interface AddQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onAdd: (quote: Omit<ProjectQuote, 'id' | 'created_at' | 'updated_at'>) => void;
}

export const AddQuoteDialog = ({ open, onOpenChange, projectId, onAdd }: AddQuoteDialogProps) => {
  const [supplier, setSupplier] = useState('');
  const [description, setDescription] = useState('');
  const [quotedAmount, setQuotedAmount] = useState('');
  const [quoteDate, setQuoteDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [quoteFileUrl, setQuoteFileUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onAdd({
      project_id: projectId,
      supplier,
      description,
      quoted_amount: parseFloat(quotedAmount) || 0,
      quote_date: quoteDate || null,
      valid_until: validUntil || null,
      status,
      quote_file_url: quoteFileUrl || null
    });

    // Reset form
    setSupplier('');
    setDescription('');
    setQuotedAmount('');
    setQuoteDate('');
    setValidUntil('');
    setStatus('pending');
    setQuoteFileUrl('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till offert</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Label htmlFor="description">Beskrivning *</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="T.ex. PA-system 3 dagar"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quotedAmount">Offererat belopp (kr) *</Label>
              <Input
                id="quotedAmount"
                type="number"
                min="0"
                step="0.01"
                value={quotedAmount}
                onChange={(e) => setQuotedAmount(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Väntande</SelectItem>
                  <SelectItem value="approved">Godkänd</SelectItem>
                  <SelectItem value="rejected">Avvisad</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quoteDate">Offertdatum</Label>
              <Input
                id="quoteDate"
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validUntil">Giltig till</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quoteFileUrl">Länk till offert (valfritt)</Label>
            <Input
              id="quoteFileUrl"
              type="url"
              value={quoteFileUrl}
              onChange={(e) => setQuoteFileUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!supplier || !description || !quotedAmount}>
              Lägg till
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
