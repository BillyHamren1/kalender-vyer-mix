import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { DerivedProduct } from '@/services/derivedAnalyticsService';
import { cn } from '@/lib/utils';

interface Props {
  products: DerivedProduct[];
}

export const ProductAnalysisTab = ({ products }: Props) => {
  const sorted = [...products];

  const mostProfitable = sorted.sort((a, b) => b.avg_project_margin_pct - a.avg_project_margin_pct).slice(0, 15);
  const highTimeLoad = sorted.sort((a, b) => b.avg_project_hours - a.avg_project_hours).slice(0, 15);
  const inBadProjects = sorted.filter(p => p.in_unprofitable_projects > 0).sort((a, b) => {
    const ratioA = a.in_unprofitable_projects / Math.max(1, a.project_count);
    const ratioB = b.in_unprofitable_projects / Math.max(1, b.project_count);
    return ratioB - ratioA;
  }).slice(0, 15);

  const chartData = mostProfitable.map(p => ({
    name: p.product_name.length > 20 ? p.product_name.slice(0, 18) + '…' : p.product_name,
    margin: p.avg_project_margin_pct,
    uses: p.project_count,
  }));

  return (
    <div className="space-y-6">
      {/* Chart: Product margin */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Snittmarginal per produkt (topp 15)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" unit="%" className="text-xs" />
              <YAxis type="category" dataKey="name" className="text-xs" width={110} />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Bar dataKey="margin" name="Snittmarginal" fill="hsl(184, 55%, 38%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* High time load */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Produkter med hög tidsbelastning</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {highTimeLoad.map(p => (
                <div key={`${p.product_name}-${p.sku}`} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.product_name}</div>
                    <div className="text-xs text-muted-foreground">{p.category || '-'} · {p.project_count} projekt</div>
                  </div>
                  <Badge variant="outline" className="text-xs">{p.avg_project_hours.toFixed(1)} h snitt</Badge>
                </div>
              ))}
              {highTimeLoad.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen data</div>}
            </div>
          </CardContent>
        </Card>

        {/* Products in bad projects */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Produkter i olönsamma projekt</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {inBadProjects.map(p => {
                const badRatio = Math.round((p.in_unprofitable_projects / Math.max(1, p.project_count)) * 100);
                return (
                  <div key={`${p.product_name}-${p.sku}`} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.product_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.in_unprofitable_projects} av {p.project_count} projekt olönsamma
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-xs', badRatio > 50 ? 'border-red-300 text-red-700' : 'border-yellow-300 text-yellow-700')}>
                      {badRatio}% olönsamma
                    </Badge>
                  </div>
                );
              })}
              {inBadProjects.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen data</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
