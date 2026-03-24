import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import type { DerivedStaff, DerivedPeriod } from '@/services/derivedAnalyticsService';

interface Props {
  staff: DerivedStaff[];
  periods: DerivedPeriod[];
}

export const StaffAnalysisTab = ({ staff, periods }: Props) => {
  const sorted = [...staff].sort((a, b) => b.total_hours - a.total_hours);
  const top15 = sorted.slice(0, 15);

  const chartData = top15.map(s => ({
    name: s.staff_name.length > 15 ? s.staff_name.slice(0, 13) + '…' : s.staff_name,
    hours: s.total_hours,
    overtime: s.total_overtime,
    projects: s.project_count,
  }));

  // Hours over time (monthly total)
  const hoursOverTime = periods.map(p => ({
    month: new Date(p.month).toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' }),
    hours: p.total_hours,
    projects: p.project_count,
  }));

  return (
    <div className="space-y-6">
      {/* Hours per staff */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Timmar per anställd (topp 15)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" />
              <YAxis type="category" dataKey="name" className="text-xs" width={90} />
              <Tooltip />
              <Legend />
              <Bar dataKey="hours" name="Timmar" fill="hsl(184, 55%, 38%)" radius={[0, 4, 4, 0]} stackId="a" />
              <Bar dataKey="overtime" name="Övertid" fill="hsl(0, 84%, 60%)" radius={[0, 4, 4, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Workload over time */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Belastning över tid</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hoursOverTime}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="hours" name="Totala timmar" fill="hsl(184, 45%, 65%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Staff detail list */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Personal × Projekttyp</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {sorted.slice(0, 20).map(s => {
              const topTypes = Object.entries(s.hours_by_project_type)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3);

              return (
                <div key={s.staff_id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{s.staff_name}</span>
                    <span className="text-xs text-muted-foreground">{s.project_count} projekt · {s.total_hours.toFixed(0)} h</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {topTypes.map(([type, hours]) => (
                      <Badge key={type} variant="secondary" className="text-[10px]">
                        {type}: {(hours as number).toFixed(0)} h
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen data</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
