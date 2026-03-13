import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Check,
  ArrowLeft,
  ArrowRight,
  Save,
  FileText,
  User,
  Calendar,
  Banknote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import BillingStatusBadge from './BillingStatusBadge';
import type {
  ProjectBilling,
  BillingStatus,
  ReviewChecklist,
} from '@/hooks/useProjectBilling';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return format(new Date(d), 'd MMM yyyy', { locale: sv }); } catch { return '—'; }
};

const CHECKLIST_ITEMS: { key: keyof ReviewChecklist; label: string }[] = [
  { key: 'hours_registered', label: 'Alla timmar registrerade' },
  { key: 'materials_included', label: 'Alla artiklar/material inkluderade' },
  { key: 'transport_included', label: 'Alla transporter inkluderade' },
  { key: 'additions_registered', label: 'Alla tillägg registrerade' },
  { key: 'client_info_correct', label: 'Korrekt kund och fakturauppgifter' },
  { key: 'deviation_checked', label: 'Avvikelse mot offert kontrollerad' },
];

interface Props {
  billing: ProjectBilling | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<ProjectBilling>) => void;
  onAdvanceStatus: (id: string, newStatus: BillingStatus) => void;
}

const BillingReviewPanel: React.FC<Props> = ({ billing, open, onClose, onSave, onAdvanceStatus }) => {
  const [checklist, setChecklist] = useState<ReviewChecklist>(billing?.review_checklist ?? {});
  const [notes, setNotes] = useState(billing?.internal_notes ?? '');

  // Reset when billing changes
  React.useEffect(() => {
    if (billing) {
      setChecklist(billing.review_checklist ?? {});
      setNotes(billing.internal_notes ?? '');
    }
  }, [billing?.id]);

  if (!billing) return null;

  const completedChecks = CHECKLIST_ITEMS.filter(c => checklist[c.key]).length;
  const allChecked = completedChecks === CHECKLIST_ITEMS.length;
  
  // Warnings
  const warnings: string[] = [];
  if (!billing.client_name) warnings.push('Kunduppgifter saknas');
  if (billing.invoiceable_amount <= 0) warnings.push('Fakturerbart belopp saknas');
  if (billing.quoted_amount > 0 && Math.abs(billing.invoiceable_amount - billing.quoted_amount) / billing.quoted_amount > 0.1) {
    warnings.push('Fakturabelopp avviker >10% från offert');
  }
  if (billing.total_cost <= 0) warnings.push('Inga kostnader registrerade');

  const margin = billing.invoiceable_amount > 0
    ? ((billing.invoiceable_amount - billing.total_cost) / billing.invoiceable_amount * 100)
    : 0;

  const handleSaveDraft = () => {
    onSave(billing.id, {
      review_checklist: checklist as any,
      internal_notes: notes,
      review_status: 'in_review',
    });
  };

  const handleNeedsCompletion = () => {
    onSave(billing.id, {
      review_checklist: checklist as any,
      internal_notes: notes,
      review_status: 'needs_completion',
      billing_status: 'under_review',
    });
  };

  const canApprove = billing.billing_status === 'under_review';
  const canCreateInvoice = billing.billing_status === 'ready_to_invoice';
  const canMarkInvoiced = billing.billing_status === 'invoice_created';
  const canMarkPaid = billing.billing_status === 'invoiced' || billing.billing_status === 'overdue';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[540px] overflow-y-auto p-0">
        <div className="p-6 space-y-6">
          <SheetHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg">{billing.project_name}</SheetTitle>
              <BillingStatusBadge status={billing.billing_status} />
            </div>
            {billing.client_name && (
              <p className="text-sm text-muted-foreground">{billing.client_name}</p>
            )}
          </SheetHeader>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-1.5">
              {warnings.map((w) => (
                <div key={w} className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md px-3 py-2 border border-amber-200/60 dark:border-amber-800/40">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Projektledare" value={billing.project_leader || '—'} />
            <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Stängningsdatum" value={formatDate(billing.closed_at)} />
            <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Eventdatum" value={formatDate(billing.event_date)} />
            <InfoRow icon={<FileText className="h-3.5 w-3.5" />} label="Projekt-ID" value={billing.project_id.slice(0, 8) + '…'} />
          </div>

          <Separator />

          {/* Financial summary */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ekonomiskt underlag</h3>
            <div className="space-y-2">
              <FinRow label="Offertvärde" value={billing.quoted_amount} />
              <FinRow label="Fakturerbart belopp" value={billing.invoiceable_amount} bold />
              <FinRow label="Total kostnad" value={billing.total_cost} negative />
              <Separator className="my-1" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Marginal</span>
                <span className={cn(
                  'text-sm font-bold',
                  margin >= 20 ? 'text-green-600' : margin >= 0 ? 'text-foreground' : 'text-destructive'
                )}>
                  {formatCurrency(billing.invoiceable_amount - billing.total_cost)} ({margin.toFixed(0)}%)
                </span>
              </div>
              {billing.invoiced_amount > 0 && (
                <FinRow label="Redan fakturerat" value={billing.invoiced_amount} muted />
              )}
            </div>
          </div>

          <Separator />

          {/* Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kontrollpunkter</h3>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {completedChecks}/{CHECKLIST_ITEMS.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item) => (
                <label key={item.key} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors cursor-pointer">
                  <Checkbox
                    checked={!!checklist[item.key]}
                    onCheckedChange={(checked) =>
                      setChecklist(prev => ({ ...prev, [item.key]: !!checked }))
                    }
                  />
                  <span className={cn(
                    'text-sm',
                    checklist[item.key] ? 'text-muted-foreground line-through' : 'text-foreground'
                  )}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* Internal notes */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intern notering</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Kommentar till ekonomi…"
              className="min-h-[80px] text-sm resize-none"
            />
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={handleSaveDraft}>
              <Save className="h-4 w-4" />
              Spara utkast
            </Button>

            {canApprove && (
              <>
                <Button variant="outline" className="w-full justify-start gap-2 text-amber-600 border-amber-200 hover:bg-amber-50" onClick={handleNeedsCompletion}>
                  <ArrowLeft className="h-4 w-4" />
                  Markera för komplettering
                </Button>
                <Button
                  className="w-full justify-start gap-2"
                  disabled={!allChecked && warnings.length > 0}
                  onClick={() => {
                    handleSaveDraft();
                    onAdvanceStatus(billing.id, 'ready_to_invoice');
                  }}
                >
                  <Check className="h-4 w-4" />
                  Godkänn för fakturering
                </Button>
              </>
            )}

            {canCreateInvoice && (
              <Button className="w-full justify-start gap-2" onClick={() => onAdvanceStatus(billing.id, 'invoice_created')}>
                <FileText className="h-4 w-4" />
                Skapa fakturaunderlag
              </Button>
            )}

            {canMarkInvoiced && (
              <Button className="w-full justify-start gap-2" onClick={() => onAdvanceStatus(billing.id, 'invoiced')}>
                <ArrowRight className="h-4 w-4" />
                Markera som fakturerad
              </Button>
            )}

            {canMarkPaid && (
              <Button className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700" onClick={() => onAdvanceStatus(billing.id, 'paid')}>
                <Banknote className="h-4 w-4" />
                Markera som betald
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
    <span className="text-muted-foreground">{icon}</span>
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground truncate">{value}</p>
    </div>
  </div>
);

const FinRow: React.FC<{ label: string; value: number; bold?: boolean; negative?: boolean; muted?: boolean }> = ({
  label, value, bold, negative, muted: isMuted,
}) => (
  <div className="flex items-center justify-between">
    <span className={cn('text-sm', isMuted ? 'text-muted-foreground' : 'text-foreground')}>
      {label}
    </span>
    <span className={cn(
      'text-sm',
      bold && 'font-semibold',
      negative && 'text-destructive',
      isMuted && 'text-muted-foreground',
    )}>
      {negative && value > 0 ? '-' : ''}{formatCurrency(Math.abs(value))}
    </span>
  </div>
);

export default BillingReviewPanel;
