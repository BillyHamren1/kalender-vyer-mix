import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string | null;
  reportDate: string;
  onConfirm: (payload: {
    target_booking_id?: string;
    target_project_id?: string;
    target_location_id?: string;
  }) => void;
  loading?: boolean;
}

interface Option { id: string; label: string; sub?: string }

export function MoveSuggestionDialog({ open, onOpenChange, organizationId, reportDate, onConfirm, loading }: Props) {
  const [tab, setTab] = useState<"booking" | "project" | "location">("booking");
  const [search, setSearch] = useState("");
  const [bookings, setBookings] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    setSelected(null);
    void (async () => {
      const [bRes, pRes, lRes] = await Promise.all([
        supabase.from("bookings")
          .select("id, client, deliveryaddress, eventdate")
          .eq("organization_id", organizationId)
          .gte("eventdate", subtractDays(reportDate, 14))
          .lte("eventdate", addDays(reportDate, 14))
          .order("eventdate", { ascending: false })
          .limit(150),
        supabase.from("large_projects")
          .select("id, name, address")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(80),
        supabase.from("organization_locations")
          .select("id, name, address")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name"),
      ]);
      setBookings((bRes.data ?? []).map((b: any) => ({
        id: b.id,
        label: b.client || b.deliveryaddress || `Bokning ${b.id.slice(0, 6)}`,
        sub: [b.eventdate, b.deliveryaddress].filter(Boolean).join(" · "),
      })));
      setProjects((pRes.data ?? []).map((p: any) => ({
        id: p.id, label: p.name || "Projekt", sub: p.address ?? undefined,
      })));
      setLocations((lRes.data ?? []).map((l: any) => ({
        id: l.id, label: l.name, sub: l.address ?? undefined,
      })));
    })();
  }, [open, organizationId, reportDate]);

  const list = useMemo(() => {
    const src = tab === "booking" ? bookings : tab === "project" ? projects : locations;
    if (!search) return src.slice(0, 60);
    const q = search.toLowerCase();
    return src.filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q)).slice(0, 60);
  }, [tab, bookings, projects, locations, search]);

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm({
      target_booking_id: tab === "booking" ? selected.id : undefined,
      target_project_id: tab === "project" ? selected.id : undefined,
      target_location_id: tab === "location" ? selected.id : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Flytta tid till annan plats</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setSelected(null); }}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="booking">Bokning</TabsTrigger>
            <TabsTrigger value="project">Projekt</TabsTrigger>
            <TabsTrigger value="location">Plats</TabsTrigger>
          </TabsList>
          <Input
            placeholder="Sök…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-3"
          />
          <TabsContent value={tab} className="mt-3">
            <ul className="max-h-72 overflow-auto rounded-md border divide-y">
              {list.length === 0 && (
                <li className="p-3 text-xs text-muted-foreground italic">Inga träffar</li>
              )}
              {list.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelected({ id: o.id, label: o.label })}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${selected?.id === o.id ? "bg-accent" : ""}`}
                  >
                    <div className="font-medium">{o.label}</div>
                    {o.sub && <div className="text-xs text-muted-foreground truncate">{o.sub}</div>}
                  </button>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Avbryt</Button>
          <Button onClick={handleConfirm} disabled={!selected || loading}>
            {loading ? "Sparar…" : selected ? `Flytta till "${selected.label}"` : "Välj plats"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function addDays(date: string, n: number) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}
function subtractDays(date: string, n: number) { return addDays(date, -n); }

export default MoveSuggestionDialog;
