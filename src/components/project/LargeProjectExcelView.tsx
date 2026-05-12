import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { LargeProjectBooking } from "@/types/largeProject";

interface Props {
  bookings: LargeProjectBooking[];
}

type SortKey =
  | { type: "client" }
  | { type: "address" }
  | { type: "tag"; tag: string }
  | { type: "untagged" };

const sortKeyId = (k: SortKey) =>
  k.type === "tag" ? `tag:${k.tag}` : k.type;

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
}

const formatProduct = (p: ProductRow) =>
  p.quantity && p.quantity > 1 ? `${p.quantity}× ${p.name}` : p.name;

const LargeProjectExcelView = ({ bookings }: Props) => {
  const bookingIds = useMemo(() => bookings.map((b) => b.booking_id), [bookings]);

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

  // Collect all unique tags across all products → table headers
  const tagHeaders = useMemo(() => {
    const seen = new Map<string, string>(); // norm-key → display
    for (const p of allProducts) {
      for (const t of p.tags) {
        const k = norm(t);
        if (!seen.has(k)) seen.set(k, t);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "sv"));
  }, [allProducts]);

  // Build rows: per booking → tag bucket → product list
  const rows = useMemo(() => {
    return bookings.map((lpb) => {
      const products = allProducts.filter((p) => p.booking_id === lpb.booking_id);
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
      const title = lpb.display_name?.trim() || lpb.booking?.booking_number
        ? `#${lpb.booking?.booking_number}`
        : "";
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
  }, [bookings, allProducts]);

  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || sortKeyId(prev.key) !== sortKeyId(key)) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r: typeof rows[number]): string | number => {
      if (sort.key.type === "client") return r.client.toLowerCase();
      if (sort.key.type === "address") return r.address.toLowerCase();
      if (sort.key.type === "untagged") return r.untagged.length;
      return (r.byTag.get(norm(sort.key.tag)) || []).length;
    };
    return [...rows].sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "sv") * dir;
    });
  }, [rows, sort]);

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

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden w-full">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className={`${headerCellClass} sticky left-0 z-10 bg-muted/60 min-w-[220px]`}>
                <SortHead label="Kund / Bokning" sortKey={{ type: "client" }} sort={sort} onToggle={toggleSort} />
              </th>
              <th className={`${headerCellClass} min-w-[200px]`}>
                <SortHead label="Plats / Adress" sortKey={{ type: "address" }} sort={sort} onToggle={toggleSort} />
              </th>
              {tagHeaders.map((tag) => (
                <th key={tag} className={`${headerCellClass} min-w-[160px]`}>
                  <SortHead label={tag} sortKey={{ type: "tag", tag }} sort={sort} onToggle={toggleSort} />
                </th>
              ))}
              <th className={`${headerCellClass} min-w-[180px]`}>
                <SortHead label="Övrigt" sortKey={{ type: "untagged" }} sort={sort} onToggle={toggleSort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, idx) => (
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
                        <ul className="space-y-0.5">
                          {items.map((p) => (
                            <li key={p.id} className="text-foreground">
                              {formatProduct(p)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
                <td className={cellClass}>
                  {r.untagged.length === 0 ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {r.untagged.map((p) => (
                        <li key={p.id} className="text-foreground">
                          {formatProduct(p)}
                        </li>
                      ))}
                    </ul>
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

const SortHead = ({
  label, sortKey, sort, onToggle,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onToggle: (k: SortKey) => void;
}) => {
  const active = sort && sortKeyId(sort.key) === sortKeyId(sortKey);
  const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`flex items-center gap-1 text-left hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
    >
      <span>{label}</span>
      <Icon className="w-3 h-3 opacity-70" />
    </button>
  );
};

export default LargeProjectExcelView;
