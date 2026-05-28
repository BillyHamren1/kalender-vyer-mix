import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combine, Search, ArrowUpDown, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import {
  consolidateProjects,
  fetchConsolidationCandidates,
  type ConsolidationCandidate,
  type ConsolidationSource,
} from '@/services/projectConsolidationService';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected project (the one user opened the dialog from). */
  initialSelection?: ConsolidationSource | null;
  /** Suggested project name (defaults to initial selection's name). */
  initialName?: string;
  /** Force initial mode (overrides inferred mode). */
  initialMode?: 'create' | 'add';
}

const TYPE_LABEL: Record<string, string> = {
  small: 'Litet',
  medium: 'Medel',
  large: 'Stort',
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};

type Mode = 'create' | 'add';

export const ConsolidateProjectsDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  initialSelection,
  initialName,
  initialMode,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>('create');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [targetLargeId, setTargetLargeId] = useState<string>('');
  const [selected, setSelected] = useState<Map<string, ConsolidationSource>>(new Map());
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['consolidation-candidates'],
    queryFn: fetchConsolidationCandidates,
    enabled: open,
  });

  const largeCandidates = useMemo(
    () => candidates.filter((c) => c.type === 'large'),
    [candidates],
  );

  // Reset state only when the dialog transitions from closed -> open.
  // Using initialSelection/initialName as deps would re-reset on every parent
  // re-render (new object identity), which makes the name input impossible to edit.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    setSearch('');
    setName(initialName || '');
    const next = new Map<string, ConsolidationSource>();
    if (initialSelection && initialSelection.type !== 'large') {
      next.set(`${initialSelection.type}:${initialSelection.id}`, initialSelection);
    }
    setSelected(next);
    if (initialMode) {
      setMode(initialMode);
      setTargetLargeId(initialSelection?.type === 'large' ? initialSelection.id : '');
    } else if (initialSelection?.type === 'large') {
      setMode('add');
      setTargetLargeId(initialSelection.id);
    } else {
      setMode('create');
      setTargetLargeId('');
    }
  }, [open, initialSelection, initialName, initialMode]);

  // Pre-fill name from initial selection's candidate name when known
  useEffect(() => {
    if (!open || initialName || !initialSelection) return;
    const match = candidates.find(
      (c) => c.type === initialSelection.type && c.id === initialSelection.id,
    );
    if (match && !name) setName(match.name);
  }, [candidates, initialSelection, initialName, open, name]);

  const referenceDate = useMemo(() => {
    if (!initialSelection) return null;
    const match = candidates.find(
      (c) => c.type === initialSelection.type && c.id === initialSelection.id,
    );
    const iso = match?.sortDate;
    return iso ? new Date(iso).getTime() : null;
  }, [candidates, initialSelection]);

  const filtered = useMemo(() => {
    // Always exclude large from selectable list — large can't be merged INTO another.
    const pool = candidates.filter((c) => c.type !== 'large');
    const q = search.trim().toLowerCase();
    const base = !q
      ? pool
      : pool.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.subtitle || '').toLowerCase().includes(q),
        );
    const dirMul = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'sv') * dirMul;
      }
      const ad = a.sortDate ? new Date(a.sortDate).getTime() : null;
      const bd = b.sortDate ? new Date(b.sortDate).getTime() : null;
      // Proximity sort: closest to reference date first (asc) / farthest first (desc).
      if (referenceDate != null) {
        const da = ad != null ? Math.abs(ad - referenceDate) : Number.POSITIVE_INFINITY;
        const db = bd != null ? Math.abs(bd - referenceDate) : Number.POSITIVE_INFINITY;
        return (da - db) * dirMul;
      }
      return ((ad ?? 0) - (bd ?? 0)) * dirMul;
    });
  }, [candidates, search, sortBy, sortDir, referenceDate]);

  const toggleSort = (col: 'date' | 'name') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'date' ? 'asc' : 'asc');
    }
  };

  const sortIcon = (col: 'date' | 'name') => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  const toggle = (c: ConsolidationCandidate) => {
    const key = `${c.type}:${c.id}`;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { type: c.type, id: c.id });
      return next;
    });
  };

  const targetLarge = useMemo(
    () => largeCandidates.find((l) => l.id === targetLargeId) || null,
    [largeCandidates, targetLargeId],
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (mode === 'add') {
        if (!targetLarge) throw new Error('Välj ett stort projekt att lägga till i');
        const sources: ConsolidationSource[] = [
          { type: 'large', id: targetLarge.id },
          ...selected.values(),
        ];
        return consolidateProjects({ name: targetLarge.name, sources });
      }
      return consolidateProjects({
        name: name.trim(),
        sources: [...selected.values()],
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      queryClient.invalidateQueries({ queryKey: ['planner-events'] });
      queryClient.invalidateQueries({ queryKey: ['consolidation-candidates'] });
      toast.success(
        mode === 'add'
          ? `Tillagt ${selected.size} projekt i stort projekt`
          : `Stort projekt skapat med ${res.bookingCount} bokningar`,
      );
      onOpenChange(false);
      navigate(`/large-project/${res.largeProjectId}`);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Konsolidering misslyckades');
    },
  });

  const [confirmText, setConfirmText] = useState('');
  useEffect(() => {
    if (!open) setConfirmText('');
  }, [open]);

  const baseValid =
    mode === 'create'
      ? name.trim().length > 0 && selected.size >= 2
      : !!targetLargeId && selected.size >= 1;
  const canSubmit =
    !mutation.isPending && baseValid && confirmText.trim().toUpperCase() === 'KONSOLIDERA';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Combine className="h-5 w-5 text-primary" />
            {mode === 'add' ? 'Lägg till i stort projekt' : 'Konsolidera till stort projekt'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="create" className="gap-1.5">
              <Combine className="h-4 w-4" />
              Skapa nytt stort projekt
            </TabsTrigger>
            <TabsTrigger value="add" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Lägg till i stort projekt
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          {mode === 'create' ? (
            <div className="space-y-1.5">
              <Label htmlFor="consolidate-name">Namn på det nya stora projektet *</Label>
              <Input
                id="consolidate-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="T.ex. Stockholmsmässan 2026"
                autoFocus
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Stort projekt att lägga till i *</Label>
              <Select value={targetLargeId} onValueChange={setTargetLargeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj stort projekt..." />
                </SelectTrigger>
                <SelectContent>
                  {largeCandidates.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      Inga stora projekt finns ännu
                    </div>
                  ) : (
                    largeCandidates.map((lp) => (
                      <SelectItem key={lp.id} value={lp.id}>
                        {lp.name}
                        {lp.subtitle ? ` · ${lp.subtitle}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              {mode === 'add'
                ? `Välj projekt att lägga till (${selected.size} valda)`
                : `Välj projekt att slå ihop (${selected.size} valda)`}
            </Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök projekt..."
                className="pl-8"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Sortera:</span>
              <Button
                type="button"
                variant={sortBy === 'date' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => toggleSort('date')}
              >
                Datum {sortIcon('date')}
              </Button>
              <Button
                type="button"
                variant={sortBy === 'name' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => toggleSort('name')}
              >
                Namn {sortIcon('name')}
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-xl border bg-card p-1.5 space-y-1">
              {isLoading ? (
                <div className="p-2 space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Inga projekt matchar sökningen
                </div>
              ) : (
                filtered.map((c) => {
                  const key = `${c.type}:${c.id}`;
                  const checked = selected.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                        checked
                          ? 'bg-primary/5 border-primary/30'
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(c)} />
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 font-medium shrink-0 border-0 ${TYPE_BADGE_CLASSES[c.type]}`}
                      >
                        {TYPE_LABEL[c.type]}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.name}</div>
                        {c.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">
                            {c.subtitle}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {mode === 'create' && selected.size < 2 && (
              <p className="text-xs text-muted-foreground">
                Välj minst två projekt för att kunna konsolidera.
              </p>
            )}
            {mode === 'add' && selected.size < 1 && (
              <p className="text-xs text-muted-foreground">
                Välj minst ett projekt att lägga till.
              </p>
            )}
          </div>
        </div>

        {baseValid && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
            <p className="text-xs text-amber-900 dark:text-amber-200">
              ⚠️ Detta {mode === 'add' ? 'lägger till' : 'slår ihop'} <strong>{selected.size}</strong>{' '}
              projekt {mode === 'add' ? `i "${targetLarge?.name ?? ''}"` : 'till ett nytt stort projekt'}.
              Bokningarna flyttas och de gamla projekten arkiveras. Skriv <strong>KONSOLIDERA</strong> för att bekräfta.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="KONSOLIDERA"
              className="h-8 text-sm"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending
              ? 'Sparar...'
              : mode === 'add'
              ? 'Lägg till i stort projekt'
              : 'Skapa stort projekt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConsolidateProjectsDialog;
