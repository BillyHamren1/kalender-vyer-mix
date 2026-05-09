import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Combine, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
}

const TYPE_LABEL: Record<string, string> = {
  small: 'Litet',
  medium: 'Medel',
  large: 'Stort',
};

export const ConsolidateProjectsDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  initialSelection,
  initialName,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Map<string, ConsolidationSource>>(new Map());
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['consolidation-candidates'],
    queryFn: fetchConsolidationCandidates,
    enabled: open,
  });

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setName(initialName || '');
    const next = new Map<string, ConsolidationSource>();
    if (initialSelection) {
      next.set(`${initialSelection.type}:${initialSelection.id}`, initialSelection);
    }
    setSelected(next);
  }, [open, initialSelection, initialName]);

  // Pre-fill name from initial selection's candidate name when known
  useEffect(() => {
    if (!open || initialName || !initialSelection) return;
    const match = candidates.find(
      (c) => c.type === initialSelection.type && c.id === initialSelection.id,
    );
    if (match && !name) setName(match.name);
  }, [candidates, initialSelection, initialName, open, name]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.subtitle || '').toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const toggle = (c: ConsolidationCandidate) => {
    const key = `${c.type}:${c.id}`;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { type: c.type, id: c.id });
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: () =>
      consolidateProjects({
        name: name.trim(),
        sources: [...selected.values()],
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['large-projects'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      queryClient.invalidateQueries({ queryKey: ['planner-events'] });
      queryClient.invalidateQueries({ queryKey: ['consolidation-candidates'] });
      toast.success(`Stort projekt skapat med ${res.bookingCount} bokningar`);
      onOpenChange(false);
      navigate(`/large-project/${res.largeProjectId}`);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Konsolidering misslyckades');
    },
  });

  const canSubmit =
    name.trim().length > 0 && selected.size >= 2 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Combine className="h-5 w-5 text-primary" />
            Konsolidera till stort projekt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="space-y-1.5">
            <Label>Välj projekt att slå ihop ({selected.size} valda)</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök projekt..."
                className="pl-8"
              />
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border divide-y">
              {isLoading ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12" />
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
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(c)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{c.name}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {TYPE_LABEL[c.type]}
                          </Badge>
                          {c.type === 'large' && (c.bookingCount || 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {c.bookingCount} bokn.
                            </span>
                          )}
                        </div>
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
            {selected.size < 2 && (
              <p className="text-xs text-muted-foreground">
                Välj minst två projekt för att kunna konsolidera.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? 'Skapar...' : 'Skapa stort projekt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConsolidateProjectsDialog;
