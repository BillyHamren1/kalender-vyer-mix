import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import EconomyStatusBadge from './EconomyStatusBadge';
import type { EconomyRiskItem } from '@/types/economyOverview';

const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};
const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };

interface Props {
  risks: EconomyRiskItem[];
}

const EconomyRiskList: React.FC<Props> = ({ risks }) => {
  const navigate = useNavigate();

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Projekt som kräver uppmärksamhet</h2>
          </div>
          {risks.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">
              {risks.length} projekt
            </Badge>
          )}
        </div>

        {risks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ShieldCheck className="h-10 w-10 text-green-500/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Inga projekt kräver uppmärksamhet just nu</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Alla projekt ser bra ut ekonomiskt</p>
          </div>
        ) : (
          <div className="space-y-1">
            {risks.slice(0, 12).map(({ project: p, reasons }) => {
              const link = p.projectSize === 'medium' ? `/economy/${p.id}` : p.navigateTo;
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(link)}
                  className="flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors group"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-[9px] px-1 py-0 font-medium shrink-0", TYPE_BADGE_CLASSES[p.projectSize])}>
                        {TYPE_LABELS[p.projectSize]}
                      </Badge>
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <EconomyStatusBadge status={p.economyStatus} className="ml-auto shrink-0" />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {reasons.map((r, i) => (
                        <span key={i} className="text-[10px] text-destructive/80 bg-destructive/5 px-1.5 py-0.5 rounded font-medium">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-0.5" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EconomyRiskList;
