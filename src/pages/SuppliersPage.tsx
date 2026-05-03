import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Download, Plus, RefreshCw, Mail, Phone, Globe, MapPin, Pencil } from "lucide-react";
import {
  listLocalSuppliers,
  importSuppliersFromRegistry,
  createSupplier,
  updateSupplier,
  type Supplier,
} from "@/services/supplierRegistry";

const EMPTY: Partial<Supplier> = {
  name: "",
  short_name: "",
  email: "",
  phone: "",
  website: "",
  address_line1: "",
  postal_code: "",
  city: "",
  country: "Sverige",
  notes: "",
};

export default function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>(EMPTY);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: listLocalSuppliers,
  });

  const importMut = useMutation({
    mutationFn: importSuppliersFromRegistry,
    onSuccess: (count) => {
      toast.success(`Importerade ${count} leverantörer`);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: any) => toast.error(`Import misslyckades: ${e.message}`),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editing?.external_id) {
        await updateSupplier(editing.external_id, form);
      } else {
        await createSupplier(form);
      }
    },
    onSuccess: () => {
      toast.success("Sparat");
      setEditing(null);
      setCreating(false);
      setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e: any) => toast.error(`Kunde inte spara: ${e.message}`),
  });

  useEffect(() => {
    if (editing) setForm(editing);
  }, [editing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.name, s.short_name, s.email, s.phone, s.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [search, suppliers]);

  const dialogOpen = creating || !!editing;
  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Leverantörer</h1>
          <p className="text-sm text-muted-foreground">
            Underleverantörer för material, möbler, transport m.m.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => importMut.mutate()} disabled={importMut.isPending}>
            {importMut.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Importera från register
          </Button>
          <Button onClick={() => { setForm(EMPTY); setCreating(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Ny leverantör
          </Button>
        </div>
      </div>

      <Input
        placeholder="Sök leverantör, e-post, telefon, ort…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {isLoading ? (
        <p className="text-muted-foreground">Laddar…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Inga leverantörer ännu. Klicka <strong>Importera från register</strong> för att hämta
            befintliga, eller <strong>Ny leverantör</strong> för att skapa en.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {s.color && (
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                    )}
                    {s.name}
                  </CardTitle>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                {s.short_name && <Badge variant="secondary">{s.short_name}</Badge>}
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {s.email && (
                  <div className="flex items-center gap-2"><Mail className="h-3 w-3" /> {s.email}</div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-2"><Phone className="h-3 w-3" /> {s.phone}</div>
                )}
                {s.website && (
                  <div className="flex items-center gap-2"><Globe className="h-3 w-3" /> {s.website}</div>
                )}
                {(s.city || s.address_line1) && (
                  <div className="flex items-center gap-2"><MapPin className="h-3 w-3" /> {[s.address_line1, s.city].filter(Boolean).join(", ")}</div>
                )}
                {s.primary_contact?.name && (
                  <div className="pt-2 border-t mt-2 text-muted-foreground">
                    Kontakt: <strong>{s.primary_contact.name}</strong>
                    {s.primary_contact.email ? ` · ${s.primary_contact.email}` : ""}
                  </div>
                )}
                {s.contacts && s.contacts.length > 1 && (
                  <p className="text-xs text-muted-foreground">+{s.contacts.length - 1} fler kontakter</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Redigera leverantör" : "Ny leverantör"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Namn *">
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Kortnamn">
              <Input value={form.short_name ?? ""} onChange={(e) => setForm({ ...form, short_name: e.target.value })} />
            </Field>
            <Field label="E-post">
              <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Webbplats">
              <Input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </Field>
            <Field label="Färg">
              <Input type="color" value={form.color ?? "#888888"} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </Field>
            <Field label="Adress" className="col-span-2">
              <Input value={form.address_line1 ?? ""} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
            </Field>
            <Field label="Postnr">
              <Input value={form.postal_code ?? ""} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </Field>
            <Field label="Ort">
              <Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Anteckningar" className="col-span-2">
              <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Avbryt</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.name || saveMut.isPending}>
              {saveMut.isPending ? "Sparar…" : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
