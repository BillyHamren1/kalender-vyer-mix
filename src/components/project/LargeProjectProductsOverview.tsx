import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, ChevronDown, ChevronRight, MoreHorizontal, Trash2, Tag, Users, List } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LargeProjectBooking } from "@/types/largeProject";
import { useProductGrouping, type ProductGroup } from "@/hooks/useProductGrouping";
import { GroupProductsDialog } from "@/components/project/GroupProductsDialog";
import { MoveProductDialog } from "@/components/project/MoveProductDialog";
import { toast } from "sonner";

interface LargeProjectProductsOverviewProps {
  bookings: LargeProjectBooking[];
  largeProjectId: string;
}

type GroupMode = "none" | "ai" | "tag" | "client";

const cleanName = (name: string) =>
  name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();

const LargeProjectProductsOverview = ({
  bookings,
  largeProjectId,
}: LargeProjectProductsOverviewProps) => {
  const bookingIds = bookings.map((b) => b.booking_id);
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [moveDialog, setMoveDialog] = useState<{ productId: string; name: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const bookingMap = useMemo(() => {
    const map = new Map<string, { client: string; deliveryaddress: string }>();
    bookings.forEach((lpb) => {
      map.set(lpb.booking_id, {
        client: lpb.booking?.client || "",
        deliveryaddress: lpb.booking?.deliveryaddress || "",
      });
    });
    return map;
  }, [bookings]);

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ["large-project-all-products", ...bookingIds],
    queryFn: async () => {
      if (bookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from("booking_products")
        .select("id, name, quantity, parent_product_id, is_package_component, sort_index, booking_id, tags")
        .in("booking_id", bookingIds)
        .order("sort_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const { grouping, generate, save, clear } = useProductGrouping("large_project", largeProjectId);

  const flatRows = useMemo(() => {
    return allProducts
      .filter((p) => !p.parent_product_id && !p.is_package_component)
      .map((p) => {
        const b = bookingMap.get(p.booking_id) || { client: "", deliveryaddress: "" };
        return {
          id: p.id,
          name: cleanName(p.name),
          quantity: p.quantity ?? 1,
          client: b.client,
          deliveryaddress: b.deliveryaddress,
          tags: Array.isArray((p as any).tags) ? ((p as any).tags as string[]) : [],
        };
      });
  }, [allProducts, bookingMap]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? flatRows.filter((r) => r.name.toLowerCase().includes(q)) : flatRows;
  }, [flatRows, search]);

  const visibleIds = useMemo(() => new Set(filteredRows.map((r) => r.id)), [filteredRows]);
  const productById = useMemo(() => new Map(flatRows.map((r) => [r.id, r])), [flatRows]);

  // AI grouped view
  const aiGroupedView = useMemo(() => {
    if (groupMode !== "ai" || !grouping) return null;
    return grouping.groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        rows: g.product_ids
          .map((id) => productById.get(id))
          .filter((r): r is (typeof flatRows)[number] => !!r && visibleIds.has(r.id)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [groupMode, grouping, productById, visibleIds]);

  // Derived (tag / client) grouped view
  const derivedGroupedView = useMemo(() => {
    if (groupMode !== "tag" && groupMode !== "client") return null;
    const buckets = new Map<string, typeof filteredRows>();
    const order: string[] = [];
    const push = (key: string, row: (typeof filteredRows)[number]) => {
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(row);
    };
    for (const row of filteredRows) {
      if (groupMode === "client") {
        push(row.client?.trim() || "Okänd kund", row);
      } else {
        const tags = row.tags.filter((t) => t && t.trim().length > 0);
        if (tags.length === 0) {
          push("Ingen tagg", row);
        } else {
          // Place product in every tag bucket so items with multiple tags appear in each
          for (const t of tags) push(t, row);
        }
      }
    }
    return order
      .sort((a, b) => {
        // Push fallback buckets to the end
        const fallback = (s: string) => s === "Ingen tagg" || s === "Okänd kund";
        if (fallback(a) && !fallback(b)) return 1;
        if (!fallback(a) && fallback(b)) return -1;
        return a.localeCompare(b, "sv");
      })
      .map((key) => ({ id: `derived:${key}`, name: key, rows: buckets.get(key)! }));
  }, [groupMode, filteredRows]);

  const groupedView = aiGroupedView ?? derivedGroupedView;

  const handleGenerate = (prompt: string) => {
    generate.mutate(
      {
        prompt,
        products: flatRows.map((r) => ({ id: r.id, name: r.name })),
      },
      {
        onSuccess: () => {
          setGroupDialogOpen(false);
          setGroupMode("ai");
          toast.success("Produkter grupperade");
        },
      }
    );
  };

  const moveProduct = (productId: string, targetGroupId: string) => {
    if (!grouping) return;
    const next: ProductGroup[] = grouping.groups.map((g) => ({
      ...g,
      product_ids: g.product_ids.filter((id) => id !== productId),
    }));
    const target = next.find((g) => g.id === targetGroupId);
    if (target) target.product_ids.push(productId);
    save.mutate({ prompt: grouping.prompt || "", groups: next });
    setMoveDialog(null);
  };

  const createAndMove = (productId: string, name: string) => {
    if (!grouping) return;
    const next: ProductGroup[] = grouping.groups.map((g) => ({
      ...g,
      product_ids: g.product_ids.filter((id) => id !== productId),
    }));
    next.push({ id: crypto.randomUUID(), name, product_ids: [productId] });
    save.mutate({ prompt: grouping.prompt || "", groups: next });
    setMoveDialog(null);
  };

  const toggleCollapsed = (gid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      return next;
    });
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
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-wrap items-center gap-2 w-full">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök produkt..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 bg-card"
          />
        </div>

        <Select
          value={groupMode}
          onValueChange={(v) => {
            const mode = v as GroupMode;
            if (mode === "ai" && !grouping) {
              setGroupDialogOpen(true);
              return;
            }
            setGroupMode(mode);
          }}
        >
          <SelectTrigger className="w-[200px] h-10 bg-card">
            <SelectValue placeholder="Gruppera efter..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="flex items-center gap-2"><List className="w-4 h-4" />Ingen gruppering</span>
            </SelectItem>
            <SelectItem value="tag">
              <span className="flex items-center gap-2"><Tag className="w-4 h-4" />Per typ (tagg)</span>
            </SelectItem>
            <SelectItem value="client">
              <span className="flex items-center gap-2"><Users className="w-4 h-4" />Per kund</span>
            </SelectItem>
            <SelectItem value="ai">
              <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" />AI-gruppering</span>
            </SelectItem>
          </SelectContent>
        </Select>

        {groupMode === "ai" && (
          <>
            <Button
              variant="outline"
              onClick={() => setGroupDialogOpen(true)}
              disabled={flatRows.length === 0 || generate.isPending}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {grouping ? "Gruppera om" : "Gruppera med AI"}
            </Button>
            {grouping && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  clear.mutate();
                  setGroupMode("none");
                }}
                title="Ta bort AI-gruppering"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </>
        )}
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Inga produkter hittades.
        </div>
      ) : (
        <Card className="border-border/50 shadow-sm overflow-hidden w-full">
          <div className="bg-card">
            <div className="grid grid-cols-[2fr_80px_1.5fr_2fr_40px] gap-4 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Produkt</div>
              <div>Antal</div>
              <div>Kund</div>
              <div>Levadress</div>
              <div></div>
            </div>

            {groupedView ? (
              <div>
                {groupedView.map((g) => {
                  const isCollapsed = collapsed.has(g.id);
                  return (
                    <div key={g.id}>
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(g.id)}
                        className="w-full flex items-center gap-2 bg-muted/40 hover:bg-muted/60 px-4 py-2 text-sm font-semibold text-foreground border-b border-border/50"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                        <span>{g.name}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          ({g.rows.length})
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="divide-y divide-border/40">
                          {g.rows.map((row) => (
                            <ProductRow
                              key={`${g.id}-${row.id}`}
                              row={row}
                              onMove={
                                groupMode === "ai"
                                  ? () => setMoveDialog({ productId: row.id, name: row.name })
                                  : null
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {filteredRows.map((row) => (
                  <ProductRow key={row.id} row={row} onMove={null} />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground">
        {filteredRows.length} produkter
        {groupedView && ` · ${groupedView.length} kategorier`}
      </div>

      <GroupProductsDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        initialPrompt={grouping?.prompt || ""}
        productCount={flatRows.length}
        isGenerating={generate.isPending}
        onGenerate={handleGenerate}
      />

      {moveDialog && grouping && (
        <MoveProductDialog
          open
          onOpenChange={(o) => !o && setMoveDialog(null)}
          productName={moveDialog.name}
          currentGroupId={
            grouping.groups.find((g) => g.product_ids.includes(moveDialog.productId))?.id || null
          }
          groups={grouping.groups}
          onMove={(targetId) => moveProduct(moveDialog.productId, targetId)}
          onCreateGroup={(name) => createAndMove(moveDialog.productId, name)}
        />
      )}
    </div>
  );
};

interface RowData {
  id: string;
  name: string;
  quantity: number;
  client: string;
  deliveryaddress: string;
}

const ProductRow = ({ row, onMove }: { row: RowData; onMove: (() => void) | null }) => (
  <div className="grid grid-cols-[2fr_80px_1.5fr_2fr_40px] gap-4 px-4 py-3 text-sm">
    <div className="font-medium text-foreground truncate" title={row.name}>
      {row.name}
    </div>
    <div className="tabular-nums text-foreground">{row.quantity} st</div>
    <div className="text-muted-foreground truncate" title={row.client}>
      {row.client || "—"}
    </div>
    <div className="text-muted-foreground truncate" title={row.deliveryaddress}>
      {row.deliveryaddress || "—"}
    </div>
    <div className="flex justify-end">
      {onMove && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onMove}>Flytta till annan kategori</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  </div>
);

export default LargeProjectProductsOverview;
