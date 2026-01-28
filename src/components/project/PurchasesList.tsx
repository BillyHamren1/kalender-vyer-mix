import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, ExternalLink, Receipt, Image } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { ProjectPurchase } from '@/types/projectEconomy';
import { AddPurchaseDialog } from './AddPurchaseDialog';

interface PurchasesListProps {
  purchases: ProjectPurchase[];
  projectId: string;
  totalAmount: number;
  onAddPurchase: (purchase: Omit<ProjectPurchase, 'id' | 'created_at'>) => void;
  onRemovePurchase: (id: string) => void;
}

export const PurchasesList = ({ 
  purchases, 
  projectId, 
  totalAmount, 
  onAddPurchase, 
  onRemovePurchase 
}: PurchasesListProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; description: string } | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getCategoryLabel = (category: string | null) => {
    switch (category) {
      case 'material': return 'Material';
      case 'transport': return 'Transport';
      default: return 'Övrigt';
    }
  };

  const isImageUrl = (url: string) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url) || url.includes('image');
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Inköp</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till
          </Button>
        </CardHeader>
        <CardContent>
          {purchases.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead>Leverantör</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Kvitto</TableHead>
                    <TableHead className="text-right">Belopp</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell>
                        {purchase.purchase_date 
                          ? format(new Date(purchase.purchase_date), 'yyyy-MM-dd', { locale: sv })
                          : '-'}
                      </TableCell>
                      <TableCell className="font-medium">{purchase.description}</TableCell>
                      <TableCell>{purchase.supplier || '-'}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 text-xs bg-muted rounded">
                          {getCategoryLabel(purchase.category)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {purchase.receipt_url ? (
                          isImageUrl(purchase.receipt_url) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-primary"
                              onClick={() => setReceiptPreview({ 
                                url: purchase.receipt_url!, 
                                description: purchase.description 
                              })}
                            >
                              <Image className="h-4 w-4 mr-1" />
                              Visa
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-primary"
                              onClick={() => window.open(purchase.receipt_url!, '_blank')}
                            >
                              <Receipt className="h-4 w-4 mr-1" />
                              Öppna
                            </Button>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(purchase.amount)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onRemovePurchase(purchase.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell colSpan={5}>TOTALT</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalAmount)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              Inga inköp registrerade
            </p>
          )}
        </CardContent>
      </Card>

      <AddPurchaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        onAdd={onAddPurchase}
      />

      {/* Receipt Image Preview Modal */}
      <Dialog open={!!receiptPreview} onOpenChange={() => setReceiptPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Kvitto: {receiptPreview?.description}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {receiptPreview && (
              <>
                <img 
                  src={receiptPreview.url} 
                  alt="Kvittobild" 
                  className="max-h-[60vh] w-auto rounded-lg shadow-md"
                />
                <Button
                  variant="outline"
                  onClick={() => window.open(receiptPreview.url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Öppna i ny flik
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
