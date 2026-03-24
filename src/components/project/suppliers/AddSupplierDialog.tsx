import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SERVICE_TYPES } from "@/types/supplier";
import { searchSuppliers, createSupplier as createWmsSupplier } from "@/services/sharedSupplierService";
import type { WmsSupplier } from "@/services/sharedSupplierService";
import { Search, Plus, Building2, Check } from "lucide-react";
import { toast } from "sonner";

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: {
    project_id: string;
    supplier_id: string;
    service_type?: string;
    quoted_price?: number;
    delivery_date?: string;
    notes?: string;
  }) => void;
  projectId: string;
}

const AddSupplierDialog = ({ open, onOpenChange, onAdd, projectId }: AddSupplierDialogProps) => {
  const [step, setStep] = useState<'search' | 'create'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WmsSupplier[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<WmsSupplier | null>(null);

  // Create new supplier fields
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  // Link fields (shared)
  const [serviceType, setServiceType] = useState('');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setStep('search');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedSupplier(null);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setServiceType('');
    setQuotedPrice('');
    setDeliveryDate('');
    setNotes('');
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchSuppliers(searchQuery.trim());
      setSearchResults(results);
    } catch (e) {
      toast.error('Kunde inte söka leverantörer');
    } finally {
      setSearching(false);
    }
  };

  const handleCreateAndLink = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const wmsSupplier = await createWmsSupplier({
        name: newName.trim(),
        email: newEmail || undefined,
        phone: newPhone || undefined,
      } as any);
      onAdd({
        project_id: projectId,
        supplier_id: wmsSupplier.id,
        service_type: serviceType || undefined,
        quoted_price: quotedPrice ? Number(quotedPrice) : undefined,
        delivery_date: deliveryDate || undefined,
        notes: notes || undefined,
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error('Kunde inte skapa leverantör');
    } finally {
      setCreating(false);
    }
  };

  const handleLinkExisting = () => {
    if (!selectedSupplier) return;
    onAdd({
      project_id: projectId,
      supplier_id: selectedSupplier.id,
      service_type: serviceType || undefined,
      quoted_price: quotedPrice ? Number(quotedPrice) : undefined,
      delivery_date: deliveryDate || undefined,
      notes: notes || undefined,
    });
    reset();
    onOpenChange(false);
  };

  const ProjectFields = () => (
    <div className="space-y-3 border-t pt-3 mt-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projektspecifikt</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tjänstetyp</Label>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger><SelectValue placeholder="Välj typ" /></SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Offererat pris (SEK)</Label>
          <Input type="number" value={quotedPrice} onChange={e => setQuotedPrice(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Leveransdatum</Label>
          <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Anteckningar</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lägg till underleverantör</DialogTitle>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-4">
            {/* Search bar */}
            <div className="flex gap-2">
              <Input
                placeholder="Sök leverantör i registret..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {searchResults.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSupplier(s)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selectedSupplier?.id === s.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      {s.email && <p className="text-xs text-muted-foreground truncate">{s.email}</p>}
                    </div>
                    {selectedSupplier?.id === s.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {searching && (
              <p className="text-sm text-muted-foreground text-center py-4">Söker...</p>
            )}

            {searchQuery && searchResults.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground text-center py-4">Inga träffar</p>
            )}

            {/* Selected supplier -> show project fields */}
            {selectedSupplier && <ProjectFields />}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('create')} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Skapa ny leverantör
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
                <Button onClick={handleLinkExisting} disabled={!selectedSupplier}>Lägg till</Button>
              </div>
            </div>
          </div>
        )}

        {step === 'create' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Skapa en ny leverantör i det centrala registret och koppla till projektet.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Företagsnamn *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Leverantörsnamn" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>E-post</Label>
                  <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefon</Label>
                  <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                </div>
              </div>
            </div>

            <ProjectFields />

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('search')}>
                ← Tillbaka till sök
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
                <Button onClick={handleCreateAndLink} disabled={!newName.trim() || creating}>
                  {creating ? 'Skapar...' : 'Skapa & lägg till'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddSupplierDialog;
