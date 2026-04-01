import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Trash2, Settings, DollarSign, BarChart3, TrendingDown,
  ShoppingCart, Receipt, Image, ExternalLink, Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";
import { useLargeProjectEconomy } from "@/hooks/useLargeProjectEconomy";
import type { LargeProjectPurchase } from "@/types/largeProject";

const fmt = (v: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(v);

const getCategoryLabel = (c: string | null) => {
  switch (c) {
    case "material": return "Material";
    case "transport": return "Transport";
    default: return "Övrigt";
  }
};

const LargeProjectEconomyPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const { project } = detail;
  const bookings = project?.bookings || [];
  const bookingIds = bookings.map((b) => b.booking_id);

  const {
    budget, purchases, summary, isLoading,
    saveBudget, addPurchase, updatePurchase, removePurchase,
  } = useLargeProjectEconomy(project?.id, bookingIds);

  const [budgetOpen, setBudgetOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<LargeProjectPurchase | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; description: string } | null>(null);

  if (!project) return null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const margin = summary.grandTotalRevenue > 0
    ? ((summary.grandTotalRevenue - summary.grandTotalCost) / summary.grandTotalRevenue) * 100
    : 0;
  const marginAmount = summary.grandTotalRevenue - summary.grandTotalCost;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt (bokningar)</p>
            </div>
            <p className="text-xl font-bold text-foreground">{fmt(summary.grandTotalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.bookingCount} bokningar</p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total kostnad</p>
            </div>
            <p className="text-xl font-bold text-foreground">{fmt(summary.grandTotalCost)}</p>
          </CardContent>
        </Card>
        <Card className={cn("border-border/40", margin < 0 && "border-red-200/60 dark:border-red-800/40")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB / Marginal</p>
            </div>
            <p className={cn("text-xl font-bold", margin >= 20 ? "text-green-600" : margin >= 0 ? "text-amber-600" : "text-red-600")}>
              {fmt(marginAmount)} ({margin.toFixed(0)}%)
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Projektinköp</p>
            </div>
            <p className="text-xl font-bold text-foreground">{fmt(summary.localPurchasesTotal)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{purchases.length} poster</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget */}
      <Card className="border-border/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Timbudget</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setBudgetOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            {budget ? "Ändra" : "Ställ in"}
          </Button>
        </CardHeader>
        <CardContent>
          {budget ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Budgeterade timmar</p>
                <p className="text-lg font-semibold">{budget.budgeted_hours}h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Timpris</p>
                <p className="text-lg font-semibold">{fmt(budget.hourly_rate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Estimerad kostnad</p>
                <p className="text-lg font-semibold">{fmt(summary.budgetedCost)}</p>
              </div>
              {budget.description && (
                <div className="col-span-3">
                  <p className="text-xs text-muted-foreground">Kommentar</p>
                  <p className="text-sm">{budget.description}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-6 text-sm">
              Ingen timbudget inställd — klicka "Ställ in" för att lägga till.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Aggregated booking economy breakdown */}
      {summary.bookingCount > 0 && (
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="text-base font-medium">Ekonomi från bokningar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Personalkostnad</p>
                <p className="font-semibold">{fmt(summary.totalStaffCost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bokningsinköp</p>
                <p className="font-semibold">{fmt(summary.totalPurchases)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Produktkostnad</p>
                <p className="font-semibold">{fmt(summary.totalCost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Leverantörsfakturor</p>
                <p className="font-semibold">{fmt(summary.totalSupplierInvoices)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purchases */}
      <Card className="border-border/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium">Projektinköp</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setEditingPurchase(null); setPurchaseOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till
          </Button>
        </CardHeader>
        <CardContent>
          {purchases.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Beskrivning</TableHead>
                  <TableHead>Leverantör</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Kvitto</TableHead>
                  <TableHead className="text-right">Belopp</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.purchase_date
                        ? format(new Date(p.purchase_date), "yyyy-MM-dd", { locale: sv })
                        : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{p.description}</TableCell>
                    <TableCell>{p.supplier || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {getCategoryLabel(p.category)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.receipt_url ? (
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(p.receipt_url) ? (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-primary"
                            onClick={() => setReceiptPreview({ url: p.receipt_url!, description: p.description })}>
                            <Image className="h-3.5 w-3.5 mr-1" /> Visa
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-primary"
                            onClick={() => window.open(p.receipt_url!, "_blank")}>
                            <Receipt className="h-3.5 w-3.5 mr-1" /> Öppna
                          </Button>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(p.amount || 0)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditingPurchase(p); setPurchaseOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removePurchase(p.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={5}>TOTALT</TableCell>
                  <TableCell className="text-right">{fmt(summary.localPurchasesTotal)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Inga projektinköp registrerade
            </p>
          )}
        </CardContent>
      </Card>

      {/* Budget Dialog */}
      <BudgetDialog
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
        currentBudget={budget || null}
        onSave={saveBudget}
      />

      {/* Purchase Dialog (add/edit) */}
      <PurchaseDialog
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        existing={editingPurchase}
        onAdd={(data) => addPurchase(data)}
        onUpdate={(id, updates) => updatePurchase({ id, updates })}
      />

      {/* Receipt preview */}
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
                <img src={receiptPreview.url} alt="Kvittobild" className="max-h-[60vh] w-auto rounded-lg shadow-md" />
                <Button variant="outline" onClick={() => window.open(receiptPreview.url, "_blank")}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Öppna i ny flik
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ─── Budget Dialog ─── */
function BudgetDialog({ open, onOpenChange, currentBudget, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentBudget: { budgeted_hours: number; hourly_rate: number; description: string | null } | null;
  onSave: (d: { budgeted_hours: number; hourly_rate: number; description?: string }) => void;
}) {
  const [hours, setHours] = useState("");
  const [rate, setRate] = useState("350");
  const [desc, setDesc] = useState("");

  const resetForm = () => {
    if (currentBudget) {
      setHours(currentBudget.budgeted_hours.toString());
      setRate(currentBudget.hourly_rate.toString());
      setDesc(currentBudget.description || "");
    } else {
      setHours(""); setRate("350"); setDesc("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Timbudget</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSave({ budgeted_hours: parseFloat(hours) || 0, hourly_rate: parseFloat(rate) || 350, description: desc || undefined }); onOpenChange(false); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Budgeterade timmar</Label>
              <Input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Timpris (kr)</Label>
              <Input type="number" min="0" step="1" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="350" />
            </div>
          </div>
          <div className="p-3 bg-muted rounded-lg text-center text-sm">
            <span className="text-muted-foreground">Estimerad kostnad:</span>{" "}
            <span className="font-bold">{fmt((parseFloat(hours) || 0) * (parseFloat(rate) || 0))}</span>
          </div>
          <div className="space-y-2">
            <Label>Kommentar</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="T.ex. baserat på 3 rigdagar..." rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button type="submit">Spara</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Purchase Dialog (add/edit) ─── */
function PurchaseDialog({ open, onOpenChange, existing, onAdd, onUpdate }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: LargeProjectPurchase | null;
  onAdd: (d: { description: string; amount: number; category?: string; supplier?: string; purchase_date?: string; receipt_url?: string }) => void;
  onUpdate: (id: string, updates: Partial<LargeProjectPurchase>) => void;
}) {
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [category, setCategory] = useState("other");
  const [receiptUrl, setReceiptUrl] = useState("");

  const resetForm = () => {
    if (existing) {
      setDescription(existing.description);
      setSupplier(existing.supplier || "");
      setAmount((existing.amount || 0).toString());
      setPurchaseDate(existing.purchase_date || "");
      setCategory(existing.category || "other");
      setReceiptUrl(existing.receipt_url || "");
    } else {
      setDescription(""); setSupplier(""); setAmount("");
      setPurchaseDate(""); setCategory("other"); setReceiptUrl("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      description,
      supplier: supplier || undefined,
      amount: parseFloat(amount) || 0,
      purchase_date: purchaseDate || undefined,
      category,
      receipt_url: receiptUrl || undefined,
    };
    if (existing) {
      onUpdate(existing.id, data);
    } else {
      onAdd(data);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Redigera inköp" : "Lägg till inköp"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Beskrivning *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="T.ex. Kablar och kontakter" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Leverantör</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="T.ex. Elgiganten" />
            </div>
            <div className="space-y-2">
              <Label>Belopp (kr) *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="other">Övrigt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Länk till kvitto (valfritt)</Label>
            <Input type="url" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button type="submit" disabled={!description || !amount}>{existing ? "Spara ändringar" : "Lägg till"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default LargeProjectEconomyPage;
