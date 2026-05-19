import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  usePayrollPeriods,
  useCreatePayrollPeriod,
  type PayrollPeriod,
} from "@/hooks/staff/usePayrollPeriods";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PayrollPeriodSelector({ selectedId, onSelect }: Props) {
  const periods = usePayrollPeriods();
  const create = useCreatePayrollPeriod();

  const today = new Date();
  const [name, setName] = useState("");
  const [start, setStart] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [showForm, setShowForm] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Ange ett namn på perioden");
      return;
    }
    if (end < start) {
      toast.error("Slutdatum måste vara efter startdatum");
      return;
    }
    try {
      const p = await create.mutateAsync({ name: name.trim(), period_start: start, period_end: end });
      toast.success(`Löneperiod skapad: ${p.name}`);
      setShowForm(false);
      setName("");
      onSelect(p.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte skapa");
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] space-y-1.5">
          <Label>Vald löneperiod</Label>
          <Select value={selectedId ?? ""} onValueChange={onSelect}>
            <SelectTrigger>
              <SelectValue placeholder={periods.isLoading ? "Laddar…" : "Välj löneperiod"} />
            </SelectTrigger>
            <SelectContent>
              {(periods.data ?? []).map((p: PayrollPeriod) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.period_start} → {p.period_end}
                  {p.status === "approved_for_payout" ? " (godkänd)" : ""}
                </SelectItem>
              ))}
              {(periods.data ?? []).length === 0 && !periods.isLoading ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">Inga löneperioder ännu</div>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <Button variant={showForm ? "secondary" : "default"} onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />
          {showForm ? "Avbryt" : "Ny löneperiod"}
        </Button>
      </div>

      {showForm ? (
        <div className="grid gap-3 md:grid-cols-4 border-t pt-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="pp-name">Namn</Label>
            <Input
              id="pp-name"
              placeholder="t.ex. Maj 2026 första halvan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-start">Från</Label>
            <Input id="pp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} max={end} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-end">Till</Label>
            <Input id="pp-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start} />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Spara löneperiod
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
