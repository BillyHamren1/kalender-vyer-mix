import React, { useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AnalyzeDayButtonProps {
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
}

interface Suggestion {
  action: 'delete_travel' | 'split_travel' | 'create_time_report' | 'reclassify_travel' | 'manual_review';
  target_id?: string;
  reason: string;
  proposed_data?: Record<string, any>;
}

interface Analysis {
  narrative: string;
  confidence: 'high' | 'medium' | 'low';
  suggestions: Suggestion[];
}

interface AnalysisResponse {
  analysis: Analysis;
  context_summary: {
    ping_count: number;
    movement_segments: number;
    time_reports: number;
    location_entries: number;
    travel_logs: number;
  };
}

const actionLabels: Record<Suggestion['action'], string> = {
  delete_travel: 'Ta bort restid',
  split_travel: 'Dela upp restid',
  create_time_report: 'Skapa tidrapport',
  reclassify_travel: 'Omklassificera',
  manual_review: 'Granska manuellt',
};

const confidenceColors = {
  high: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-rose-600 bg-rose-50 border-rose-200',
};

export const AnalyzeDayButton: React.FC<AnalyzeDayButtonProps> = ({ staffId, staffName, date }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-staff-day', {
        body: { staff_id: staffId, date },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as AnalysisResponse);
    } catch (e: any) {
      const msg = e?.message || 'Okänt fel';
      setError(msg);
      toast.error('AI-analys misslyckades', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-primary"
        onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
        title="AI-analysera dagen baserat på GPS + tidrapporter"
      >
        <Sparkles className="h-3 w-3" />
        Analysera
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI-analys
            </SheetTitle>
            <SheetDescription>
              {staffName} · {date}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {loading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Läser GPS, tidrapporter och bokningar…
              </div>
            )}

            {error && !loading && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Kunde inte analysera</div>
                  <div className="text-xs mt-1 opacity-80">{error}</div>
                </div>
              </div>
            )}

            {result && !loading && (
              <>
                {/* Confidence + summary */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${confidenceColors[result.analysis.confidence]}`}>
                    Säkerhet: {result.analysis.confidence === 'high' ? 'Hög' : result.analysis.confidence === 'medium' ? 'Medel' : 'Låg'}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {result.context_summary.ping_count} GPS-pings · {result.context_summary.time_reports} tidrapporter · {result.context_summary.travel_logs} resor
                  </span>
                </div>

                {/* Narrative */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Dagberättelse</h3>
                  <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                    {result.analysis.narrative}
                  </p>
                </div>

                {/* Suggestions */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Förslag ({result.analysis.suggestions.length})
                  </h3>
                  {result.analysis.suggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Inga förslag — dagen ser konsekvent ut.</p>
                  ) : (
                    <ul className="space-y-2">
                      {result.analysis.suggestions.map((s, i) => (
                        <li
                          key={i}
                          className="border border-border rounded-md p-3 bg-muted/20"
                        >
                          <div className="flex items-start gap-2">
                            <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <Badge variant="secondary" className="text-[10px]">
                                  {actionLabels[s.action]}
                                </Badge>
                                {s.target_id && (
                                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                                    {s.target_id.slice(0, 8)}…
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-foreground">{s.reason}</p>
                              {s.proposed_data && Object.keys(s.proposed_data).length > 0 && (
                                <pre className="mt-2 text-[10px] bg-background/60 rounded p-2 overflow-x-auto text-muted-foreground">
                                  {JSON.stringify(s.proposed_data, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
                  AI ändrar aldrig data automatiskt. Förslagen är till för att hjälpa dig se mönster — du gör alla ändringar manuellt.
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
