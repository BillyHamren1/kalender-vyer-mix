import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';

interface Rule {
  id: string;
  scope: string;
  pattern_type: string;
  human_readable: string;
  confidence: number;
  verified_count: number;
  rejected_count: number;
  active: boolean;
  learned_at: string;
  last_used_at: string | null;
  staff_id: string | null;
  large_project_id: string | null;
}

export default function AiLearnedRules() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['ai-learned-rules'],
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase
        .from('staff_time_learning_rules')
        .select('id, scope, pattern_type, human_readable, confidence, verified_count, rejected_count, active, learned_at, last_used_at, staff_id, large_project_id')
        .order('learned_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as Rule[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('staff_time_learning_rules')
        .update({ active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Regel uppdaterad');
      qc.invalidateQueries({ queryKey: ['ai-learned-rules'] });
    },
  });

  return (
    <div className="container mx-auto py-6 max-w-5xl space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h1 className="text-2xl font-bold">Lärda regler</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        AI:n sparar mönster den lärt sig från personalens tidsrapporter. Inaktivera regler
        som inte stämmer – då slutar de påverka framtida granskningar.
      </p>

      {isLoading && <div className="text-sm text-muted-foreground">Laddar…</div>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          Inga regler lärda än. AI:n bygger sin förståelse efter ett par dagars granskning.
        </Card>
      )}

      <div className="space-y-2">
        {(data || []).map((r) => (
          <Card key={r.id} className={`p-4 ${!r.active ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.human_readable}</span>
                  <Badge variant="outline" className="text-[10px]">{r.scope}</Badge>
                  <Badge variant="outline" className="text-[10px]">{r.pattern_type}</Badge>
                  {!r.active && <Badge variant="destructive" className="text-[10px]">Inaktiv</Badge>}
                </div>
                <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                  <span>Säkerhet: {Math.round(r.confidence * 100)}%</span>
                  <span>Bekräftad: {r.verified_count}×</span>
                  <span>Avvisad: {r.rejected_count}×</span>
                  <span>
                    Lärd {formatDistanceToNow(new Date(r.learned_at), { addSuffix: true, locale: sv })}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                disabled={toggle.isPending}
              >
                {r.active ? (
                  <><PowerOff className="w-3.5 h-3.5 mr-1" /> Inaktivera</>
                ) : (
                  <><Power className="w-3.5 h-3.5 mr-1" /> Aktivera</>
                )}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
