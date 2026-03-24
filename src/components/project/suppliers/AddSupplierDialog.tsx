import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SERVICE_TYPES } from "@/types/supplier";

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: {
    project_id: string;
    name: string;
    company_name?: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    service_type?: string;
    quoted_price?: number;
    delivery_date?: string;
    notes?: string;
  }) => void;
  projectId: string;
}

const AddSupplierDialog = ({ open, onOpenChange, onAdd, projectId }: AddSupplierDialogProps) => {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setName(''); setCompanyName(''); setContactPerson('');
    setEmail(''); setPhone(''); setServiceType('');
    setQuotedPrice(''); setDeliveryDate(''); setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      project_id: projectId,
      name: name.trim(),
      company_name: companyName || undefined,
      contact_person: contactPerson || undefined,
      email: email || undefined,
      phone: phone || undefined,
      service_type: serviceType || undefined,
      quoted_price: quotedPrice ? Number(quotedPrice) : undefined,
      delivery_date: deliveryDate || undefined,
      notes: notes || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lägg till underleverantör</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">Namn *</Label>
              <Input id="s-name" value={name} onChange={e => setName(e.target.value)} placeholder="Leverantörsnamn" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-company">Företag</Label>
              <Input id="s-company" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Företagsnamn" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-contact">Kontaktperson</Label>
              <Input id="s-contact" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-service">Tjänstetyp</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue placeholder="Välj typ" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-email">E-post</Label>
              <Input id="s-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-phone">Telefon</Label>
              <Input id="s-phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-price">Offererat pris (SEK)</Label>
              <Input id="s-price" type="number" value={quotedPrice} onChange={e => setQuotedPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-date">Leveransdatum</Label>
              <Input id="s-date" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-notes">Anteckningar</Label>
            <Textarea id="s-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button type="submit" disabled={!name.trim()}>Lägg till</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddSupplierDialog;
