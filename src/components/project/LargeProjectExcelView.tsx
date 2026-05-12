import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUp, ArrowDown, ArrowUpDown, GripVertical, Plus, Pencil, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { LargeProjectBooking } from "@/types/largeProject";
import { useLargeProjectViewConfig, type CustomColumn } from "@/hooks/useLargeProjectViewConfig";
import { toast } from "sonner";

interface Props {
  bookings: LargeProjectBooking[];
}

const cleanName = (name: string) =>
  name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();
const norm = (s: string) => s.toLowerCase().trim();

const mergeTags = (a: string[], b: string[]): string[] => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const t of [...a, ...b]) {
    const k = norm(t);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(t.trim());
  }
  return out;
};

interface ProductRow {
  id: string; name: string; quantity: number; booking_id: string; tags: string[];
}
const formatProduct = (p: ProductRow) =>
  p.quantity && p.quantity > 1 ? `${p.quantity}× ${p.name}` : p.name;

// Column id system: "client" | "address" | "untagged" | "tag:<norm>" | "custom:<uuid>"
type ColId = string;

const LargeProjectExcelView = ({ bookings }: Props) => {
  const largeProjectId = bookings[0]?.large_project_id;
  const bookingIds = useMemo(() => bookings.map((b) => b.booking_id), [bookings]);
  const { config, save } = useLargeProjectViewConfig(largeProjectId);

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ["large-project-excel-view-products", ...bookingIds],
    queryFn: async () => {
      if (bookingIds.length === 0) return [] as ProductRow[];
      const { data, error } = await supabase
        .from("booking_products")
        .select("id, name, quantity, parent_product_id, is_package_component, booking_id, tags, local_tags, sort_index")
        .in("booking_id", bookingIds)
        .order("sort_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || [])
        .filter((p: any) => !p.parent_product_id && !p.is_package_component)
        .map((p: any) => ({
          id: p.id,
          name: cleanName(p.name || ""),
          quantity: p.quantity ?? 1,
          booking_id: p.booking_id,
          tags: mergeTags(
            Array.isArray(p.tags) ? p.tags : [],
            Array.isArray(p.local_tags) ? p.local_tags : [],
          ),
        })) as ProductRow[];
    },
    enabled: bookingIds.length > 0,
  });

  const tagDisplay = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of allProducts) {
      for (const t of p.tags) {
        const k = norm(t);
        if (!seen.has(k)) seen.set(k, t);
      }
    }
    return seen; // norm-key → display
  }, [allProducts]);

  // Build available columns
  const allColumns = useMemo(() => {
    const cols: { id: ColId; label: string; kind: "client" | "address" | "tag" | "untagged" | "custom"; tagKey?: string }[] = [
      { id: "client", label: "Kund / Bokning", kind: "client" },
      { id: "address", label: "Plats / Adress", kind: "address" },
    ];
    for (const [k, label] of Array.from(tagDisplay.entries()).sort((a, b) => a[1].localeCompare(b[1], "sv"))) {
      cols.push({ id: `tag:${k}`, label, kind: "tag", tagKey: k });
    }
    cols.push({ id: "untagged", label: "Övrigt", kind: "untagged" });
    for (const c of config.custom_columns) {
      cols.push({ id: c.id, label: c.label, kind: "custom" });
    }
    return cols;
  }, [tagDisplay, config.custom_columns]);

  // Resolve effective column order: use saved order filtered to existing ids, then append missing
  const orderedColumns = useMemo(() => {
    const byId = new Map(allColumns.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const out: typeof allColumns = [];
    for (const id of config.column_order) {
      const c = byId.get(id);
      if (c && !seen.has(id)) { out.push(c); seen.add(id); }
    }
    for (const c of allColumns) {
      if (!seen.has(c.id)) out.push(c);
    }
    return out;
  }, [allColumns, config.column_order]);

  // Build rows
  const rows = useMemo(() => {
    return bookings.map((lpb) => {
      const products = allProducts.filter((p) => p.booking_id === lpb.booking_id);
      const byTag = new Map<string, ProductRow[]>();
      const untagged: ProductRow[] = [];
      for (const p of products) {
        if (p.tags.length === 0) untagged.push(p);
        else for (const t of p.tags) {
          const k = norm(t);
          if (!byTag.has(k)) byTag.set(k, []);
          byTag.get(k)!.push(p);
        }
      }
      const client = lpb.booking?.client?.trim() || "Okänd kund";
      const title = lpb.display_name?.trim() || lpb.booking?.booking_number
        ? `#${lpb.booking?.booking_number}` : "";
      const address = lpb.booking?.deliveryaddress?.trim() || "";
      const cityParts = [lpb.booking?.delivery_postal_code, lpb.booking?.delivery_city]
        .filter(Boolean).join(" ");
      const fullAddress = [address, cityParts].filter(Boolean).join(", ");
      return {
        id: lpb.id,
        booking_id: lpb.booking_id,
        client, title, address: fullAddress, byTag, untagged,
      };
    });
  }, [bookings, allProducts]);

  // Sorting
  const [sortId, setSortId] = useState<{ id: ColId; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (id: ColId) => {
    setSortId((prev) => {
      if (!prev || prev.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  };

  const cellValue = (r: typeof rows[number], col: typeof allColumns[number]): string | number => {
    switch (col.kind) {
      case "client": return r.client.toLowerCase();
      case "address": return r.address.toLowerCase();
      case "untagged": return r.untagged.length;
      case "tag": return (r.byTag.get(col.tagKey!) || []).length;
      case "custom": return (config.custom_values[r.booking_id]?.[col.id] || "").toLowerCase();
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortId) return rows;
    const col = orderedColumns.find((c) => c.id === sortId.id);
    if (!col) return rows;
    const dir = sortId.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = cellValue(a, col); const bv = cellValue(b, col);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "sv") * dir;
    });
  }, [rows, sortId, orderedColumns, config.custom_values]);

  // Column reordering (HTML5 DnD)
  const [dragId, setDragId] = useState<string | null>(null);
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = orderedColumns.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    save({ ...config, column_order: next });
    setDragId(null);
  };

  // Add / edit custom columns
  const [colDialog, setColDialog] = useState<{ mode: "add" } | { mode: "rename"; id: string; current: string } | null>(null);
  const [colDraft, setColDraft] = useState("");

  const openAddCol = () => { setColDraft(""); setColDialog({ mode: "add" }); };
  const openRenameCol = (id: string, current: string) => { setColDraft(current); setColDialog({ mode: "rename", id, current }); };

  const submitColDialog = () => {
    const label = colDraft.trim();
    if (!label) { toast.error("Ange ett kolumnnamn"); return; }
    if (!colDialog) return;
    if (colDialog.mode === "add") {
      const id = `custom:${crypto.randomUUID()}`;
      const next: CustomColumn[] = [...config.custom_columns, { id, label }];
      save({ ...config, custom_columns: next, column_order: [...config.column_order, id] });
    } else {
      const next = config.custom_columns.map((c) => c.id === colDialog.id ? { ...c, label } : c);
      save({ ...config, custom_columns: next });
    }
    setColDialog(null);
  };

  const deleteCustomCol = (id: string) => {
    if (!confirm("Ta bort kolumnen och dess inmatningar?")) return;
    const customs = config.custom_columns.filter((c) => c.id !== id);
    const order = config.column_order.filter((x) => x !== id);
    const values: typeof config.custom_values = {};
    for (const [bid, vals] of Object.entries(config.custom_values)) {
      const { [id]: _drop, ...rest } = vals;
      values[bid] = rest;
    }
    save({ ...config, custom_columns: customs, column_order: order, custom_values: values });
  };

  const setCustomValue = (bookingId: string, colId: string, value: string) => {
    const current = config.custom_values[bookingId]?.[colId] || "";
    if (current === value) return;
    const nextRow = { ...(config.custom_values[bookingId] || {}), [colId]: value };
    if (!value.trim()) delete nextRow[colId];
    const nextValues = { ...config.custom_values, [bookingId]: nextRow };
    save({ ...config, custom_values: nextValues });
  };

  if (bookingIds.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        Inga bokningar kopplade till projektet.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-10 w-full" />))}
      </div>
    );
  }

  const headerCellClass =
    "px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border align-middle whitespace-nowrap";
  const cellClass = "px-5 py-3.5 text-sm align-top";

  return (
    <Card className="border-border/60 rounded-2xl shadow-xl shadow-foreground/5 overflow-hidden w-full bg-card">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-border/70 flex items-center justify-between bg-card sticky top-0 z-30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={openAddCol}
            className="rounded-lg shadow-sm hover:shadow transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 mr-1.5 text-muted-foreground" />
            Lägg till kolumn
          </Button>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Dra kolumnrubriker för att ändra ordning. Egna kolumner kan redigeras direkt i tabellen.
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left min-w-[900px]">
          <thead className="bg-muted/40 backdrop-blur-sm">
            <tr>
              {orderedColumns.map((col, idx) => {
                const isCustom = col.kind === "custom";
                const sticky = idx === 0;
                const active = sortId?.id === col.id;
                const Icon = !active ? ArrowUpDown : sortId!.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.id}
                    draggable
                    onDragStart={() => setDragId(col.id)}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={() => onDrop(col.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`${headerCellClass} min-w-[180px] ${sticky ? "sticky left-0 z-20 bg-muted/60 border-r min-w-[240px]" : ""} ${dragId === col.id ? "opacity-50 ring-2 ring-primary/50" : ""} cursor-move group/th transition-colors hover:bg-muted/60`}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 opacity-30 group-hover/th:opacity-70 transition-opacity shrink-0" />
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={`flex items-center gap-1.5 text-left transition-colors ${active ? "text-foreground" : "hover:text-foreground"}`}
                      >
                        <span className="truncate">{col.label}</span>
                        <Icon className={`w-3 h-3 transition-opacity ${active ? "opacity-100" : "opacity-40 group-hover/th:opacity-70"}`} />
                      </button>
                      {isCustom && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="ml-auto opacity-0 group-hover/th:opacity-60 hover:!opacity-100 px-1.5 rounded hover:bg-foreground/10 transition-all"
                            >
                              ⋯
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openRenameCol(col.id, col.label)}>
                              <Pencil className="w-3 h-3 mr-2" /> Byt namn
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteCustomCol(col.id)} className="text-destructive">
                              <Trash2 className="w-3 h-3 mr-2" /> Ta bort
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, idx) => {
              const zebra = idx % 2 === 1;
              const rowBg = zebra ? "bg-muted/20" : "bg-card";
              return (
                <tr
                  key={r.id}
                  className={`group/row ${rowBg} hover:bg-accent/40 transition-colors`}
                >
                  {orderedColumns.map((col, cidx) => {
                    const sticky = cidx === 0;
                    const stickyClass = sticky
                      ? `sticky left-0 z-10 ${rowBg} group-hover/row:bg-accent/40 border-r border-border/60 shadow-[6px_0_12px_-8px_hsl(var(--foreground)/0.15)]`
                      : "border-b border-border/40";
                    const baseCell = `${cellClass} ${sticky ? "border-b border-border/40" : ""} ${stickyClass}`;
                    if (col.kind === "client") {
                      return (
                        <td key={col.id} className={baseCell}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-foreground leading-tight">{r.client}</span>
                            {r.title && (
                              <span className="text-[11px] font-medium text-primary/80 uppercase tracking-wide font-mono">
                                {r.title}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }
                    if (col.kind === "address") {
                      return (
                        <td key={col.id} className={baseCell}>
                          {r.address ? (
                            <div className="text-sm text-foreground/80 leading-snug">{r.address}</div>
                          ) : (
                            <span className="text-muted-foreground/40 font-light">—</span>
                          )}
                        </td>
                      );
                    }
                    if (col.kind === "untagged") {
                      return (
                        <td key={col.id} className={baseCell}>
                          {r.untagged.length === 0 ? (
                            <span className="text-muted-foreground/40 font-light">—</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {r.untagged.map((p) => (
                                <li key={p.id} className="text-sm text-foreground/90">{formatProduct(p)}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      );
                    }
                    if (col.kind === "tag") {
                      const items = r.byTag.get(col.tagKey!) || [];
                      return (
                        <td key={col.id} className={baseCell}>
                          {items.length === 0 ? (
                            <span className="text-muted-foreground/40 font-light">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {items.map((p) => (
                                <li key={p.id} className="inline-flex items-center px-2 py-0.5 mr-1 rounded-md bg-secondary/60 text-secondary-foreground text-xs font-medium border border-border/60">
                                  {formatProduct(p)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      );
                    }
                    // custom
                    return (
                      <td key={col.id} className={baseCell}>
                        <CustomCell
                          initial={config.custom_values[r.booking_id]?.[col.id] || ""}
                          onCommit={(v) => setCustomValue(r.booking_id, col.id, v)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between">
        <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
          Visar {rows.length} bokningar · {orderedColumns.length} kolumner
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500/60 animate-ping" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">Realtidsuppdaterad vy</span>
        </div>
      </div>

      <Dialog open={!!colDialog} onOpenChange={(o) => !o && setColDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{colDialog?.mode === "rename" ? "Byt namn på kolumn" : "Lägg till kolumn"}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Kolumnnamn (t.ex. Kommentar, Status, Ansvarig)"
            value={colDraft}
            onChange={(e) => setColDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitColDialog(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setColDialog(null)}>Avbryt</Button>
            <Button onClick={submitColDialog}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const CustomCell = ({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }) => {
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);
  return (
    <Input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") { setVal(initial); (e.currentTarget as HTMLInputElement).blur(); }
      }}
      placeholder="—"
      className="h-8 text-sm border-transparent hover:border-border focus:border-ring bg-transparent"
    />
  );
};

export default LargeProjectExcelView;
