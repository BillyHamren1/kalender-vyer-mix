import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LargeProjectBooking } from "@/types/largeProject";

interface Props {
  bookings: LargeProjectBooking[];
}

const cleanName = (name: string) =>
  name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();

const norm = (s: string) => s.toLowerCase().trim();

const mergeTags = (a: string[], b: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...a, ...b]) {
    const k = norm(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
  }
  return out;
};

interface ProductRow {
  id: string;
  name: string;
  quantity: number;
  booking_id: string;
  tags: string[];
  parent_id: string | null;
  is_package_component: boolean;
  children: ProductRow[];
}

const formatProduct = (p: { name: string; quantity: number }) =>
  p.quantity && p.quantity > 1 ? `${p.quantity}× ${p.name}` : p.name;

const LargeProjectExcelView = ({ bookings }: Props) => {
  const bookingIds = useMemo(() => bookings.map((b) => b.booking_id), [bookings]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { data: parents = [], isLoading } = useQuery({
    queryKey: ["large-project-excel-view-products-v2", ...bookingIds],
    queryFn: async () => {
      if (bookingIds.length === 0) return [] as ProductRow[];
      const { data, error } = await supabase
        .from("booking_products")
        .select("id, name, quantity, parent_product_id, is_package_component, booking_id, tags, local_tags, sort_index")
        .in("booking_id", bookingIds)
        .order("sort_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const all = (data || []).map((p: any) => ({
        id: p.id,
        name: cleanName(p.name || ""),
        quantity: p.quantity ?? 1,
        booking_id: p.booking_id,
        tags: mergeTags(
          Array.isArray(p.tags) ? p.tags : [],
          Array.isArray(p.local_tags) ? p.local_tags : [],
        ),
        parent_id: p.parent_product_id ?? null,
        is_package_component: !!p.is_package_component,
        children: [] as ProductRow[],
      })) as ProductRow[];

      const byId = new Map(all.map((p) => [p.id, p]));
      const roots: ProductRow[] = [];
      for (const p of all) {
        const isChild = p.parent_id || p.is_package_component;
        if (isChild && p.parent_id && byId.has(p.parent_id)) {
          byId.get(p.parent_id)!.children.push(p);
        } else if (!isChild) {
          roots.push(p);
        }
        // children utan parent i listan: skippa (samma som tidigare beteende)
      }
      return roots;
    },
    enabled: bookingIds.length > 0,
  });

  const tagHeaders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of parents) {
      for (const t of p.tags) {
        const k = norm(t);
        if (!seen.has(k)) seen.set(k, t);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "sv"));
  }, [parents]);

  const rows = useMemo(() => {
    return bookings.map((lpb) => {
      const products = parents.filter((p) => p.booking_id === lpb.booking_id);
      const byTag = new Map<string, ProductRow[]>();
      const untagged: ProductRow[] = [];
      for (const p of products) {
        if (p.tags.length === 0) {
          untagged.push(p);
        } else {
          for (const t of p.tags) {
            const k = norm(t);
            if (!byTag.has(k)) byTag.set(k, []);
            byTag.get(k)!.push(p);
          }
        }
      }
      const client = lpb.booking?.client?.trim() || "Okänd kund";
      const title = lpb.display_name?.trim() || (lpb.booking?.booking_number
        ? `#${lpb.booking?.booking_number}`
        : "");
      const address = lpb.booking?.deliveryaddress?.trim() || "";
      const cityParts = [lpb.booking?.delivery_postal_code, lpb.booking?.delivery_city]
        .filter(Boolean)
        .join(" ");
      const fullAddress = [address, cityParts].filter(Boolean).join(", ");

      return {
        id: lpb.id,
        client,
        title,
        address: fullAddress,
        byTag,
        untagged,
      };
    });
  }, [bookings, parents]);

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
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const headerCellClass =
    "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-r border-border/60 bg-muted/40 align-bottom whitespace-nowrap";
  const cellClass =
    "px-3 py-2 text-sm border-b border-r border-border/40 align-top";

  const renderProductList = (items: ProductRow[]) => (
    <ul className="space-y-1">
      {items.map((p) => {
        const hasChildren = p.children.length > 0;
        const isOpen = expanded.has(p.id);
        return (
          <li key={p.id} className="text-foreground">
            <div className="flex items-start gap-1">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={isOpen ? "Dölj tillbehör" : "Visa tillbehör"}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span className="flex-1">
                {formatProduct(p)}
                {hasChildren && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({p.children.length})
                  </span>
                )}
              </span>
            </div>
            {hasChildren && isOpen && (
              <ul className="ml-4 mt-1 space-y-0.5 border-l border-border/40 pl-2">
                {p.children.map((c) => (
                  <li key={c.id} className="text-xs text-muted-foreground">
                    {formatProduct(c)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );

  const expandAll = () => {
    const all = new Set<string>();
    for (const p of parents) if (p.children.length > 0) all.add(p.id);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set());

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden w-full">
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-border/40 bg-muted/20">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={expandAll}>
          Visa alla tillbehör
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={collapseAll}>
          Dölj alla
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className={`${headerCellClass} sticky left-0 z-10 bg-muted/60 min-w-[220px]`}>
                Kund / Bokning
              </th>
              <th className={`${headerCellClass} min-w-[200px]`}>Plats / Adress</th>
              {tagHeaders.map((tag) => (
                <th key={tag} className={`${headerCellClass} min-w-[160px]`}>
                  {tag}
                </th>
              ))}
              <th className={`${headerCellClass} min-w-[180px]`}>Övrigt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className={idx % 2 === 0 ? "bg-card" : "bg-muted/10"}>
                <td className={`${cellClass} sticky left-0 z-10 ${idx % 2 === 0 ? "bg-card" : "bg-muted/10"}`}>
                  <div className="font-semibold text-foreground">{r.client}</div>
                  {r.title && (
                    <div className="text-xs text-muted-foreground mt-0.5">{r.title}</div>
                  )}
                </td>
                <td className={cellClass}>
                  <span className="text-sm text-foreground">{r.address || "—"}</span>
                </td>
                {tagHeaders.map((tag) => {
                  const items = r.byTag.get(norm(tag)) || [];
                  return (
                    <td key={tag} className={cellClass}>
                      {items.length === 0 ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        renderProductList(items)
                      )}
                    </td>
                  );
                })}
                <td className={cellClass}>
                  {r.untagged.length === 0 ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    renderProductList(r.untagged)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
        <span>{rows.length} bokningar</span>
        <span>·</span>
        <span>{tagHeaders.length} tagg-kolumner</span>
        {tagHeaders.length > 0 && (
          <div className="flex gap-1 flex-wrap ml-2">
            {tagHeaders.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default LargeProjectExcelView;
