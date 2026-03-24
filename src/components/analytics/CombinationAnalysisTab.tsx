import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ZAxis } from 'recharts';
import type { DerivedProductCombination } from '@/services/derivedAnalyticsService';
import { cn } from '@/lib/utils';

interface Props {
  combinations: DerivedProductCombination[];
}

export const CombinationAnalysisTab = ({ combinations }: Props) => {
  const byTime = [...combinations].sort((a, b) => b.avg_hours - a.avg_hours).slice(0, 15);
  const byLowMargin = [...combinations].sort((a, b) => a.avg_margin_pct - b.avg_margin_pct).slice(0, 15);

  const scatterData = combinations.map(c => ({
    x: c.avg_hours,
    y: c.avg_margin_pct,
    z: c.co_occurrence_count,
    name: `${c.category_a} + ${c.category_b}`,
  }));

  return (
    <div className="space-y-6">
      {/* Scatter: Hours vs Margin */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Kombinationer: Tid vs Marginal</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" dataKey="x" name="Snittimmar" unit=" h" className="text-xs" />
              <YAxis type="number" dataKey="y" name="Snittmarginal" unit="%" className="text-xs" />
              <ZAxis type="number" dataKey="z" name="Förekomster" range={[40, 400]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: number, name: string) => name === 'Snittimmar' ? `${v.toFixed(1)} h` : name === 'Snittmarginal' ? `${v.toFixed(1)}%` : v} />
              <Scatter data={scatterData} fill="hsl(184, 55%, 38%)" fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High time combos */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Kombinationer som driver tid</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {byTime.map((c, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{c.category_a} + {c.category_b}</div>
                    <div className="text-xs text-muted-foreground">{c.co_occurrence_count} projekt</div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">{c.avg_hours.toFixed(1)} h</Badge>
                  </div>
                </div>
              ))}
              {byTime.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Behöver fler avslutade projekt</div>}
            </div>
          </CardContent>
        </Card>

        {/* Low margin combos */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Kombinationer med låg marginal</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {byLowMargin.map((c, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{c.category_a} + {c.category_b}</div>
                    <div className="text-xs text-muted-foreground">{c.co_occurrence_count} projekt</div>
                  </div>
                  <Badge variant="outline" className={cn('text-xs', c.avg_margin_pct < 10 ? 'border-red-300 text-red-700' : 'border-yellow-300 text-yellow-700')}>
                    {c.avg_margin_pct.toFixed(1)}%
                  </Badge>
                </div>
              ))}
              {byLowMargin.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Behöver fler avslutade projekt</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
