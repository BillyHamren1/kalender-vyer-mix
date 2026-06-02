import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUp, ArrowDown, ArrowUpDown, GripVertical, Plus, Pencil, Trash2,
  MapPin, Package, Layers, Hash, Building2,
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
    const cols: { id: ColId; label: string; kind: "client" | "address" | "qty" | "tag" | "untagged" | "custom"; tagKey?: string }[] = [
      { id: "client", label: "Kund / Bokning", kind: "client" },
      { id: "address", label: "Plats / Adress", kind: "address" },
      { id: "qty", label: "Antal", kind: "qty" },
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
      case "qty": return r.untagged.length + Array.from(r.byTag.values()).reduce((s, v) => s + v.length, 0);
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

  // Flatten: one row per product within each booking. Bookings without
  // products still produce a single empty row so the booking remains visible.
  const flatRows = useMemo(() => {
    type Flat = {
      key: string;
      bookingRow: typeof sortedRows[number];
      product: ProductRow | null;
      isFirstInBooking: boolean;
      bookingRowSpan: number;
    };
    const out: Flat[] = [];
    for (const br of sortedRows) {
      const products: ProductRow[] = [];
      // Preserve original product order: untagged + tagged (deduped by id)
      const seen = new Set<string>();
      for (const p of br.untagged) { if (!seen.has(p.id)) { seen.add(p.id); products.push(p); } }
      for (const arr of br.byTag.values()) {
        for (const p of arr) { if (!seen.has(p.id)) { seen.add(p.id); products.push(p); } }
      }
      const span = Math.max(1, products.length);
      if (products.length === 0) {
        out.push({ key: `${br.id}:empty`, bookingRow: br, product: null, isFirstInBooking: true, bookingRowSpan: 1 });
      } else {
        products.forEach((p, i) => {
          out.push({ key: `${br.id}:${p.id}`, bookingRow: br, product: p, isFirstInBooking: i === 0, bookingRowSpan: span });
        });
      }
    }
    return out;
  }, [sortedRows]);

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
    "px-5 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground/90 border-b border-border/70 align-middle whitespace-nowrap select-none";
  const cellClass = "px-5 py-3 text-sm align-top";

  // Summary derived from existing data — read-only
  const totalProducts = allProducts.length;
  const totalBookings = rows.length;
  const totalColumns = orderedColumns.length;

  // Initials for client avatar
  const initialsOf = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <Card className="border-border/60 rounded-[24px] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_40px_-24px_hsl(var(--planner)/0.35)] overflow-hidden w-full bg-card">
      {/* Premium Toolbar */}
      <div className="px-6 py-5 border-b border-border/70 bg-gradient-to-b from-planner/[0.06] via-card to-card sticky top-0 z-30 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="h-11 w-11 rounded-2xl bg-white ring-1 ring-planner/20 shadow-[0_2px_8px_-2px_hsl(var(--planner)/0.4)] flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5 text-planner" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-planner/80">
                Projektöversikt
              </div>
              <h3 className="text-[15px] font-semibold text-foreground leading-tight mt-0.5 tracking-tight">
                Bokningar, platser & produkter
              </h3>
              <p className="text-[11.5px] text-muted-foreground leading-tight mt-1">
                Sammanställd vy med drag & drop-kolumner och inline-redigering
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SummaryPill icon={Building2} label="Bokningar" value={totalBookings} />
            <SummaryPill icon={Package} label="Produkter" value={totalProducts} />
            <SummaryPill icon={Hash} label="Kolumner" value={totalColumns} />
            <Button
              size="sm"
              onClick={openAddCol}
              className="rounded-lg h-9 shadow-[0_2px_8px_-2px_hsl(var(--planner)/0.45)] bg-planner text-white hover:bg-planner/90 transition-all active:scale-[0.98] font-medium"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Lägg till kolumn
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-3 hidden md:block">
          Tips: dra kolumnrubriker för att ändra ordning. Klicka på rubriken för att sortera. Egna kolumner redigeras direkt i tabellen.
        </p>
      </div>


      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left min-w-[960px]">
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
                    className={`${headerCellClass} min-w-[180px] ${sticky ? "sticky left-0 z-20 bg-muted/70 border-r border-border/70 min-w-[280px]" : ""} ${dragId === col.id ? "opacity-50 ring-2 ring-planner/50" : ""} cursor-move group/th transition-colors hover:bg-muted/70`}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 opacity-25 group-hover/th:opacity-70 transition-opacity shrink-0" />
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={`flex items-center gap-1.5 text-left transition-colors min-w-0 ${active ? "text-foreground" : "hover:text-foreground"}`}
                      >
                        <span className="truncate">{col.label}</span>
                        <Icon className={`w-3 h-3 shrink-0 transition-opacity ${active ? "opacity-100" : "opacity-40 group-hover/th:opacity-70"}`} />
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
            {flatRows.map((fr, idx) => {
              const r = fr.bookingRow;
              const p = fr.product;
              const bookingIdx = sortedRows.findIndex((sr) => sr.id === r.id);
              const zebra = bookingIdx % 2 === 1;
              const rowBg = zebra ? "bg-muted/25" : "bg-card";
              const productCount = fr.bookingRowSpan;
              // Mark the last row of a booking to draw a stronger separator
              const isLastInBooking = idx === flatRows.length - 1 || flatRows[idx + 1]?.bookingRow.id !== r.id;
              const groupSeparator = isLastInBooking ? "border-b-[2px] border-border/70" : "border-b border-border/30";

              return (
                <tr
                  key={fr.key}
                  className={`group/row ${rowBg} hover:bg-accent/40 transition-colors`}
                >
                  {orderedColumns.map((col, cidx) => {
                    const sticky = cidx === 0;
                    const stickyClass = sticky
                      ? `sticky left-0 z-10 ${rowBg} group-hover/row:bg-accent/40 border-r border-border/70 shadow-[6px_0_12px_-8px_hsl(var(--foreground)/0.18)]`
                      : "";
                    const baseCell = `${cellClass} ${groupSeparator} ${stickyClass}`;
                    const mergedCell = `${baseCell} align-top`;

                    // Booking-level cells (rowSpan): client, address, custom
                    if (col.kind === "client") {
                      if (!fr.isFirstInBooking) return null;
                      return (
                        <td key={col.id} className={mergedCell} rowSpan={fr.bookingRowSpan}>
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-planner/15 to-planner/5 border border-planner/15 flex items-center justify-center shrink-0 text-[11px] font-bold text-planner tracking-wide">
                              {initialsOf(r.client)}
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-[13.5px] font-semibold text-foreground leading-tight truncate" title={r.client}>
                                {r.client}
                              </span>
                              {r.title && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-planner/80 uppercase tracking-wider font-mono w-fit px-1.5 py-0.5 rounded-md bg-planner/8 border border-planner/15">
                                  {r.title}
                                </span>
                              )}
                              <span className="text-[10.5px] text-muted-foreground/80 inline-flex items-center gap-1 mt-0.5">
                                <Package className="w-3 h-3" />
                                {productCount} {productCount === 1 ? "produkt" : "produkter"}
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    }
                    if (col.kind === "address") {
                      if (!fr.isFirstInBooking) return null;
                      return (
                        <td key={col.id} className={mergedCell} rowSpan={fr.bookingRowSpan}>
                          {r.address ? (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground/70 mt-[3px] shrink-0" />
                              <div className="text-[13px] text-foreground/85 leading-snug whitespace-pre-line">{r.address}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40 font-light">—</span>
                          )}
                        </td>
                      );
                    }
                    if (col.kind === "custom") {
                      if (!fr.isFirstInBooking) return null;
                      return (
                        <td key={col.id} className={mergedCell} rowSpan={fr.bookingRowSpan}>
                          <CustomCell
                            initial={config.custom_values[r.booking_id]?.[col.id] || ""}
                            onCommit={(v) => setCustomValue(r.booking_id, col.id, v)}
                          />
                        </td>
                      );
                    }

                    // Product-level cells: qty, untagged, tag
                    if (col.kind === "qty") {
                      return (
                        <td key={col.id} className={baseCell}>
                          {p ? (
                            <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-md bg-muted/70 border border-border/60 text-[12px] font-mono font-semibold tabular-nums text-foreground/90">
                              {p.quantity ?? 1}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 font-light">—</span>
                          )}
                        </td>
                      );
                    }
                    if (col.kind === "untagged") {
                      const show = p && p.tags.length === 0;
                      return (
                        <td key={col.id} className={baseCell}>
                          {show ? (
                            <span className="text-[13px] text-foreground/90 leading-snug">{p!.name}</span>
                          ) : (
                            <span className="text-muted-foreground/30 font-light">—</span>
                          )}
                        </td>
                      );
                    }
                    if (col.kind === "tag") {
                      const show = p && p.tags.some((t) => norm(t) === col.tagKey);
                      return (
                        <td key={col.id} className={baseCell}>
                          {show ? (
                            <span className="inline-flex items-center text-[13px] text-foreground leading-snug px-2 py-0.5 rounded-md bg-accent/40 border border-border/40">
                              {p!.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30 font-light">—</span>
                          )}
                        </td>
                      );
                    }
                    return null;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 border-t border-border/60 bg-gradient-to-b from-card to-muted/20 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="w-3 h-3" />
            <span className="tabular-nums font-semibold text-foreground/80">{totalBookings}</span> bokningar
          </span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Package className="w-3 h-3" />
            <span className="tabular-nums font-semibold text-foreground/80">{totalProducts}</span> produkter
          </span>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Hash className="w-3 h-3" />
            <span className="tabular-nums font-semibold text-foreground/80">{totalColumns}</span> kolumner
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500/60 animate-ping" />
            <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
          </span>
          <span className="text-[11.5px] font-medium text-muted-foreground">Realtidsuppdaterad vy</span>
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

const SummaryPill = ({
  icon: Icon, label, value,
}: { icon: typeof Layers; label: string; value: number }) => (
  <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white border border-planner/15 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
    <Icon className="w-3.5 h-3.5 text-planner" />
    <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold">{label}</span>
    <span className="text-[13px] tabular-nums font-bold text-foreground">{value}</span>
  </div>
);


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
      placeholder="Klicka för att skriva…"
      className="h-9 text-[13px] border-transparent hover:border-border/60 hover:bg-background focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20 bg-transparent transition-all rounded-md placeholder:text-muted-foreground/35 placeholder:font-light placeholder:italic"
    />
  );
};


export default LargeProjectExcelView;
