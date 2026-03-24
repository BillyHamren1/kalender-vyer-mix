import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SupplierStatusBadge } from "./SupplierStatusBadge";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import type { ProjectSupplier, SupplierStatus } from "@/types/supplier";
import { SUPPLIER_STATUS_ORDER, SUPPLIER_STATUS_LABELS } from "@/types/supplier";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Send, FileCheck, CheckCircle2, XCircle, MessageSquare,
  Building2, User, Mail, Phone, Calendar, StickyNote, DollarSign, Trash2,
} from "lucide-react";

interface SupplierDetailSheetProps {
  supplier: ProjectSupplier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (id: string, status: SupplierStatus) => void;
  onUpdate: (id: string, updates: Partial<ProjectSupplier>) => void;
  onDelete: (id: string) => void;
}

const StatusTimeline = ({ current }: { current: SupplierStatus }) => {
  const flow = SUPPLIER_STATUS_ORDER.filter(s => s !== 'cancelled');
  const currentIdx = flow.indexOf(current);
  const isCancelled = current === 'cancelled';

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {flow.map((step, i) => {
        const isPast = !isCancelled && i <= currentIdx;
        const isCurrent = !isCancelled && i === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center rounded-full text-[10px] font-bold h-6 w-6 shrink-0 transition-colors ${
                isCurrent
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                  : isPast
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-[10px] whitespace-nowrap ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {SUPPLIER_STATUS_LABELS[step]}
            </span>
            {i < flow.length - 1 && (
              <div className={`h-px w-4 shrink-0 ${isPast && i < currentIdx ? 'bg-primary/40' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
      {isCancelled && (
        <div className="flex items-center gap-1 ml-2">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-xs font-semibold text-destructive">Avbokad</span>
        </div>
      )}
    </div>
  );
};

const ACTIONS: { status: SupplierStatus; label: string; icon: React.ElementType; from: SupplierStatus[] }[] = [
  { status: 'request_sent', label: 'Skicka förfrågan', icon: Send, from: ['draft'] },
  { status: 'quote_received', label: 'Offert mottagen', icon: FileCheck, from: ['request_sent'] },
  { status: 'negotiating', label: 'Förhandla', icon: MessageSquare, from: ['quote_received'] },
  { status: 'confirmed', label: 'Bekräfta leverantör', icon: CheckCircle2, from: ['quote_received', 'negotiating'] },
  { status: 'cancelled', label: 'Avboka', icon: XCircle, from: ['draft', 'request_sent', 'quote_received', 'negotiating'] },
];

const SupplierDetailSheet = ({ supplier, open, onOpenChange, onStatusChange, onUpdate, onDelete }: SupplierDetailSheetProps) => {
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [editPricing, setEditPricing] = useState(false);
  const [quotedPrice, setQuotedPrice] = useState('');
  const [confirmedPrice, setConfirmedPrice] = useState('');

  if (!supplier) return null;

  const availableActions = ACTIONS.filter(a => a.from.includes(supplier.status));

  const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <span className="text-muted-foreground">{label}: </span>
          <span className="text-foreground">{value}</span>
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg">{supplier.name}</SheetTitle>
            <SupplierStatusBadge status={supplier.status} />
          </div>
          {supplier.company_name && (
            <p className="text-sm text-muted-foreground">{supplier.company_name}</p>
          )}
        </SheetHeader>

        {/* Status Timeline */}
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Statusflöde</h4>
          <StatusTimeline current={supplier.status} />
        </div>

        {/* Actions */}
        {availableActions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {availableActions.map(action => (
              <Button
                key={action.status}
                size="sm"
                variant={action.status === 'cancelled' ? 'destructive' : action.status === 'confirmed' ? 'default' : 'outline'}
                onClick={() => onStatusChange(supplier.id, action.status)}
                className="gap-1.5"
              >
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            ))}
          </div>
        )}

        <Separator className="my-4" />

        {/* Basic Info */}
        <div className="space-y-2 mb-5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Kontaktinfo</h4>
          <InfoRow icon={Building2} label="Företag" value={supplier.company_name} />
          <InfoRow icon={User} label="Kontaktperson" value={supplier.contact_person} />
          <InfoRow icon={Mail} label="E-post" value={supplier.email} />
          <InfoRow icon={Phone} label="Telefon" value={supplier.phone} />
          <InfoRow icon={Calendar} label="Leveransdatum" value={supplier.delivery_date ? format(new Date(supplier.delivery_date), 'd MMMM yyyy', { locale: sv }) : null} />
        </div>

        <Separator className="my-4" />

        {/* Pricing */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prissättning</h4>
            <Button variant="ghost" size="sm" onClick={() => {
              setQuotedPrice(supplier.quoted_price?.toString() || '');
              setConfirmedPrice(supplier.confirmed_price?.toString() || '');
              setEditPricing(!editPricing);
            }}>
              {editPricing ? 'Avbryt' : 'Redigera'}
            </Button>
          </div>

          {editPricing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Offererat pris (SEK)</Label>
                <Input type="number" value={quotedPrice} onChange={e => setQuotedPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Bekräftat pris (SEK)</Label>
                <Input type="number" value={confirmedPrice} onChange={e => setConfirmedPrice(e.target.value)} />
              </div>
              <Button size="sm" onClick={() => {
                onUpdate(supplier.id, {
                  quoted_price: quotedPrice ? Number(quotedPrice) : null,
                  confirmed_price: confirmedPrice ? Number(confirmedPrice) : null,
                });
                setEditPricing(false);
              }}>
                Spara
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <InfoRow icon={DollarSign} label="Offererat" value={supplier.quoted_price != null ? `${supplier.quoted_price.toLocaleString('sv-SE')} ${supplier.currency}` : null} />
              <InfoRow icon={DollarSign} label="Bekräftat" value={supplier.confirmed_price != null ? `${supplier.confirmed_price.toLocaleString('sv-SE')} ${supplier.currency}` : null} />
              {supplier.quoted_price == null && supplier.confirmed_price == null && (
                <p className="text-sm text-muted-foreground italic">Inget pris angivet</p>
              )}
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Notes */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anteckningar</h4>
            <Button variant="ghost" size="sm" onClick={() => {
              setNotes(supplier.notes || '');
              setEditNotes(!editNotes);
            }}>
              {editNotes ? 'Avbryt' : 'Redigera'}
            </Button>
          </div>

          {editNotes ? (
            <div className="space-y-2">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
              <Button size="sm" onClick={() => {
                onUpdate(supplier.id, { notes });
                setEditNotes(false);
              }}>
                Spara
              </Button>
            </div>
          ) : (
            supplier.notes ? (
              <p className="text-sm text-foreground whitespace-pre-wrap">{supplier.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Inga anteckningar</p>
            )
          )}
        </div>

        <Separator className="my-4" />

        {/* Communication placeholder */}
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Kommunikation</h4>
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Kommunikationshistorik kommer snart</p>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Delete */}
        <ConfirmationDialog
          title="Ta bort underleverantör"
          description={`Vill du ta bort ${supplier.name}? Detta kan inte ångras.`}
          confirmLabel="Ta bort"
          cancelLabel="Avbryt"
          onConfirm={() => {
            onDelete(supplier.id);
            onOpenChange(false);
          }}
        >
          <Button variant="destructive" size="sm" className="gap-1.5 w-full">
            <Trash2 className="h-3.5 w-3.5" />
            Ta bort underleverantör
          </Button>
        </ConfirmationDialog>
      </SheetContent>
    </Sheet>
  );
};

export default SupplierDetailSheet;
