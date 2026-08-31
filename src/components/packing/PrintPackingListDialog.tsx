import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  openPrintablePackingList,
  type PrintablePackingMeta,
  type PrintablePackingRow,
} from '@/lib/packing/printPackingList';
import { derivePackingPrintRequirements } from '@/lib/packing/packingPrintRequirements';

interface PrintPackingListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: PrintablePackingMeta | null;
  rows: PrintablePackingRow[];
}

const PrintPackingListDialog = ({ open, onOpenChange, meta, rows }: PrintPackingListDialogProps) => {
  const [orderedRows, setOrderedRows] = useState<PrintablePackingRow[]>(rows);

  useEffect(() => {
    if (open) setOrderedRows(rows);
  }, [open, rows]);

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedRows.length) return;
    setOrderedRows((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const handlePrint = () => {
    if (!meta) return;
    openPrintablePackingList(
      { ...meta, requirements: derivePackingPrintRequirements(orderedRows) },
      orderedRows,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ordning på utskriften</DialogTitle>
          <DialogDescription>
            Standardordningen hämtas från bokningen. Flytta en rad om packordningen behöver ändras för just den här utskriften.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto rounded-lg border divide-y">
          {orderedRows.map((row, index) => (
            <div key={`${row.groupLabel || ''}-${row.name}-${index}`} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className={`truncate text-sm ${row.isChild ? 'pl-4 text-muted-foreground' : 'font-medium'}`}>
                  {row.name}
                </div>
              </div>
              <span className="text-xs font-mono text-muted-foreground">{row.quantity} st</span>
              <Button variant="ghost" size="icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Flytta upp">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => move(index, 1)} disabled={index === orderedRows.length - 1} aria-label="Flytta ned">
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOrderedRows(rows)}>Återställ standard</Button>
          <Button onClick={handlePrint} disabled={!meta || orderedRows.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Skriv ut
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrintPackingListDialog;
