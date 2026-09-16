import { useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, PackageCheck, PackageX, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useUserRoles } from '@/hooks/useUserRoles';
import {
  fetchWmsInventoryItemTypes,
  updateWmsItemTypePackability,
  type WmsInventoryItemType,
} from '@/services/wmsInventoryService';

const WarehouseInventoryPlaceholder = () => {
  const { hasWarehouseAccess, isLoading: rolesLoading } = useUserRoles();
  const [items, setItems] = useState<WmsInventoryItemType[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<WmsInventoryItemType | null>(null);
  const [editValue, setEditValue] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOffset(0);
      setDebouncedSearch(search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWmsInventoryItemTypes({ search: debouncedSearch, limit: 100, offset });
      setItems(result.items);
      setTotal(result.total);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta produkter från WMS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (rolesLoading) return;
    if (!hasWarehouseAccess) {
      setLoading(false);
      return;
    }
    void load();
  }, [debouncedSearch, offset, hasWarehouseAccess, rolesLoading]);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );
  const allSelected = items.length > 0 && selected.size === items.length;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(items.map((item) => item.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const save = async (targets: WmsInventoryItemType[], value: boolean) => {
    if (!hasWarehouseAccess) return;
    setSaving(true);
    try {
      const updated = await updateWmsItemTypePackability(targets, value);
      const updatedById = new Map(updated.map((item) => [item.id, item]));
      setItems((current) => current.map((item) => (
        updatedById.get(item.id) ?? (targets.some((target) => target.id === item.id)
          ? { ...item, isPackableDefault: value, revision: item.revision + 1 }
          : item)
      )));
      setSelected(new Set());
      setEditing(null);
      toast.success(targets.length === 1 ? 'Produktens packningsstandard uppdaterades' : `${targets.length} produkter uppdaterades`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ändringen kunde inte sparas.');
      // A revision conflict means the list is stale; reload canonical WMS state.
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="container mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warehouse">
              <Boxes className="h-4 w-4" /> Inventory
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--heading))]">Produkter</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Styr om nya orderrader ska ingå i packflödet. Ändringen påverkar inte redan skapade packprojekt.
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Sök produkter"
              className="pl-9"
              placeholder="Sök namn eller artikelnummer"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </header>

        {selectedItems.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-warehouse/25 bg-card p-3 shadow-sm">
            <span className="mr-auto text-sm font-medium">{selectedItems.length} valda</span>
            <Button variant="outline" size="sm" disabled={saving || !hasWarehouseAccess} onClick={() => void save(selectedItems, false)}>
              <PackageX className="mr-2 h-4 w-4" /> Ej packningsbara
            </Button>
            <Button size="sm" className="bg-warehouse hover:bg-warehouse-hover" disabled={saving || !hasWarehouseAccess} onClick={() => void save(selectedItems, true)}>
              <PackageCheck className="mr-2 h-4 w-4" /> Packningsbara
            </Button>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          {loading || rolesLoading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Hämtar produkter från WMS…
            </div>
          ) : !hasWarehouseAccess ? (
            <div className="flex min-h-64 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              Du saknar behörighet till Inventory. Rollen admin eller lager krävs.
            </div>
          ) : error ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void load()}>Försök igen</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Inga produkter hittades.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox aria-label="Välj alla produkter" checked={allSelected} onCheckedChange={(value) => toggleAll(value === true)} />
                  </TableHead>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Artikelnummer</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Packningsbar som standard</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onDoubleClick={() => { setEditing(item); setEditValue(item.isPackableDefault); }}>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox aria-label={`Välj ${item.name}`} checked={selected.has(item.id)} onCheckedChange={(value) => toggleOne(item.id, value === true)} />
                    </TableCell>
                    <TableCell>
                      <button className="text-left font-medium hover:underline" onClick={() => { setEditing(item); setEditValue(item.isPackableDefault); }}>
                        {item.name}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.sku || '—'}</TableCell>
                    <TableCell>{item.category || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={item.isPackableDefault ? 'default' : 'secondary'} className={item.isPackableDefault ? 'bg-warehouse hover:bg-warehouse' : ''}>
                        {item.isPackableDefault ? 'Ja' : 'Nej'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {!loading && !error && total > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Visar {offset + 1}–{Math.min(offset + items.length, total)} av {total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 100))}>
                Föregående
              </Button>
              <Button variant="outline" size="sm" disabled={offset + items.length >= total} onClick={() => setOffset((current) => current + 100)}>
                Nästa
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera produkt</DialogTitle>
            <DialogDescription>{editing?.name}{editing?.sku ? ` · ${editing.sku}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <div>
              <Label htmlFor="packable-default" className="text-sm font-medium">Packningsbar som standard</Label>
              <p className="mt-1 text-xs text-muted-foreground">Används när nya order- och packrader skapas.</p>
            </div>
            <Switch id="packable-default" checked={editValue} onCheckedChange={setEditValue} disabled={!hasWarehouseAccess || saving} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Avbryt</Button>
            <Button className="bg-warehouse hover:bg-warehouse-hover" disabled={!editing || !hasWarehouseAccess || saving} onClick={() => editing && void save([editing], editValue)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehouseInventoryPlaceholder;
