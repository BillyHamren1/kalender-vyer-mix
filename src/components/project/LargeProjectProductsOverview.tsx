import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Sparkles, ChevronDown, ChevronRight, MoreHorizontal, Trash2, Tag, Users, List, Wand2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
import { ProductTagEditorDialog } from "@/components/project/ProductTagEditorDialog";
import { BulkAiTagDialog } from "@/components/project/BulkAiTagDialog";
import { toast } from "sonner";

interface LargeProjectProductsOverviewProps {
  bookings: LargeProjectBooking[];
  largeProjectId: string;
}

type GroupMode = "none" | "ai" | "tag" | "client";
type SortKey = "name" | "quantity" | "tags" | "client" | "deliveryaddress";

const cleanName = (name: string) =>
  name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();

const norm = (s: string) => s.toLowerCase().trim();
const mergeTags = (imported: string[], local: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...imported, ...local]) {
    const k = norm(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
  }
  return out;
};

// Vocabulary key per large project (lokalt cachat tills vidare)
const vocabKey = (lpId: string) => `product-tag-vocab:${lpId}`;

const LargeProjectProductsOverview = ({
  bookings,
  largeProjectId,
}: LargeProjectProductsOverviewProps) => {
  const bookingIds = bookings.map((b) => b.booking_id);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [moveDialog, setMoveDialog] = useState<{ productId: string; name: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tagEditor, setTagEditor] = useState<{
    id: string; name: string; imported: string[]; local: string[];
  } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [vocab, setVocab] = useState<string>(() => {
    try { return localStorage.getItem(vocabKey(largeProjectId)) || ""; }
    catch { return ""; }
  });

  const persistVocab = (v: string) => {
    setVocab(v);
    try { localStorage.setItem(vocabKey(largeProjectId), v); } catch { /* ignore */ }
  };

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

  const productsQueryKey = ["large-project-all-products", ...bookingIds];

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: productsQueryKey,
    queryFn: async () => {
      if (bookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from("booking_products")
        .select("id, name, quantity, parent_product_id, is_package_component, sort_index, booking_id, tags, local_tags")
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
        const importedTags = Array.isArray((p as any).tags) ? ((p as any).tags as string[]) : [];
        const localTags = Array.isArray((p as any).local_tags) ? ((p as any).local_tags as string[]) : [];
        return {
          id: p.id,
          name: cleanName(p.name),
          quantity: p.quantity ?? 1,
          client: b.client,
          deliveryaddress: b.deliveryaddress,
          importedTags,
          localTags,
          tags: mergeTags(importedTags, localTags),
        };
      });
  }, [allProducts, bookingMap]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? flatRows.filter((r) => r.name.toLowerCase().includes(q)) : flatRows;
  }, [flatRows, search]);

  const sortRows = <T extends RowData>(rows: T[]): T[] => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const key = sort.key;
    const val = (r: T): string | number => {
      if (key === "quantity") return r.quantity ?? 0;
      if (key === "tags") return r.tags.length;
      if (key === "name") return r.name?.toLowerCase() || "";
      if (key === "client") return r.client?.toLowerCase() || "";
      return r.deliveryaddress?.toLowerCase() || "";
    };
    return [...rows].sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "sv") * dir;
    });
  };

  const sortedFilteredRows = useMemo(() => sortRows(filteredRows), [filteredRows, sort]);

  const visibleIds = useMemo(() => new Set(sortedFilteredRows.map((r) => r.id)), [sortedFilteredRows]);
  const productById = useMemo(() => new Map(flatRows.map((r) => [r.id, r])), [flatRows]);

  const untaggedCount = useMemo(
    () => flatRows.filter((r) => r.tags.length === 0).length,
    [flatRows]
  );

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
          for (const t of tags) push(t, row);
        }
      }
    }
    return order
      .sort((a, b) => {
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

  const handleTagsSaved = (productId: string, newLocalTags: string[]) => {
    queryClient.setQueryData(productsQueryKey, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((p: any) => p.id === productId ? { ...p, local_tags: newLocalTags } : p);
    });
  };

  const handleBulkApplied = (applied: Record<string, string[]>) => {
    queryClient.setQueryData(productsQueryKey, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((p: any) => applied[p.id] ? { ...p, local_tags: applied[p.id] } : p);
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

        {untaggedCount > 0 && (
          <Button
            variant="outline"
            onClick={() => setBulkOpen(true)}
            title="Tagga otaggade produkter med AI"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Tagga otaggade ({untaggedCount})
          </Button>
        )}

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
            <div className="grid grid-cols-[2fr_80px_1.3fr_1.3fr_1.5fr_40px] gap-4 border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Produkt</div>
              <div>Antal</div>
              <div>Taggar</div>
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
                              onTag={() => setTagEditor({
                                id: row.id, name: row.name,
                                imported: row.importedTags, local: row.localTags,
                              })}
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
                  <ProductRow
                    key={row.id}
                    row={row}
                    onMove={null}
                    onTag={() => setTagEditor({
                      id: row.id, name: row.name,
                      imported: row.importedTags, local: row.localTags,
                    })}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground">
        {filteredRows.length} produkter
        {groupedView && ` · ${groupedView.length} kategorier`}
        {untaggedCount > 0 && ` · ${untaggedCount} utan tagg`}
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

      {tagEditor && (
        <ProductTagEditorDialog
          open
          onOpenChange={(o) => !o && setTagEditor(null)}
          productId={tagEditor.id}
          productName={tagEditor.name}
          importedTags={tagEditor.imported}
          localTags={tagEditor.local}
          vocabulary={vocab}
          onSaved={(t) => handleTagsSaved(tagEditor.id, t)}
        />
      )}

      <BulkAiTagDialog
        open={bulkOpen}
        onOpenChange={(o) => {
          setBulkOpen(o);
        }}
        untagged={flatRows.filter((r) => r.tags.length === 0).map((r) => ({ id: r.id, name: r.name }))}
        defaultVocabulary={vocab}
        onApplied={(applied) => {
          handleBulkApplied(applied);
          // Persist last-used vocabulary for next time
          // (vocabulary state inside dialog isn't lifted; we accept this for now)
        }}
      />
    </div>
  );
};

interface RowData {
  id: string;
  name: string;
  quantity: number;
  client: string;
  deliveryaddress: string;
  tags: string[];
  importedTags: string[];
  localTags: string[];
}

const ProductRow = ({
  row, onMove, onTag,
}: {
  row: RowData;
  onMove: (() => void) | null;
  onTag: () => void;
}) => (
  <div className="grid grid-cols-[2fr_80px_1.3fr_1.3fr_1.5fr_40px] gap-4 px-4 py-3 text-sm items-center">
    <div className="font-medium text-foreground truncate" title={row.name}>
      {row.name}
    </div>
    <div className="tabular-nums text-foreground">{row.quantity} st</div>
    <div className="flex flex-wrap gap-1 min-w-0">
      {row.tags.length === 0 ? (
        <button
          onClick={onTag}
          className="text-xs text-muted-foreground hover:text-foreground italic underline-offset-2 hover:underline"
        >
          + tagga
        </button>
      ) : (
        row.tags.slice(0, 3).map((t) => (
          <Badge
            key={t}
            variant="default"
            className="text-[10px] px-1.5 py-0 h-5"
          >
            {t}
          </Badge>
        ))
      )}
      {row.tags.length > 3 && (
        <span className="text-[10px] text-muted-foreground">+{row.tags.length - 3}</span>
      )}
    </div>
    <div className="text-muted-foreground truncate" title={row.client}>
      {row.client || "—"}
    </div>
    <div className="text-muted-foreground truncate" title={row.deliveryaddress}>
      {row.deliveryaddress || "—"}
    </div>
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onTag}>
            <Tag className="w-4 h-4 mr-2" /> Redigera taggar
          </DropdownMenuItem>
          {onMove && (
            <DropdownMenuItem onClick={onMove}>Flytta till annan kategori</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
);

export default LargeProjectProductsOverview;
