import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, ClipboardList, FolderKanban, Building2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useUnplannedProjects } from '@/hooks/useUnplannedProjects';
import { ProjectPlanningSheet } from '@/components/project/ProjectPlanningSheet';
import { UnplannedTodosBanner } from '@/components/Calendar/UnplannedTodosBanner';

/**
 * Container ovanför kalendern som listar alla projekt som väntar på
 * planering (planning_status = 'needs_planning'). Klick öppnar
 * ProjectPlanningSheet där användaren sätter tider + team per dag.
 */
export const UnplannedProjectsBanner: React.FC = () => {
  const { data: projects = [], isLoading } = useUnplannedProjects();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openKind, setOpenKind] = useState<'medium' | 'large' | null>(null);

  const formatDate = (s: string | null) => {
    if (!s) return '–';
    try { return format(new Date(s), 'd MMM yyyy', { locale: sv }); } catch { return s; }
  };

  const showProjects = !isLoading && projects.length > 0;

  return (
    <>
      <UnplannedTodosBanner />
      {showProjects && (
      <div className="rounded-xl border border-primary/30 bg-card overflow-hidden shadow-sm mx-2 mb-2">
        <div className="px-4 py-2 border-b border-primary/20 bg-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">Att planera</h3>
            <span className="text-[11px] text-muted-foreground">
              Sätt tider och team innan jobben hamnar i kalendern
            </span>
          </div>
          <Badge className="h-5 px-2 text-xs font-medium bg-primary/20 text-primary border-0">
            {projects.length}
          </Badge>
        </div>

        <div className="divide-y divide-border/30 max-h-[160px] overflow-y-auto">
          {projects.map(p => (
            <button
              key={`${p.kind}-${p.id}`}
              type="button"
              onClick={() => { setOpenId(p.id); setOpenKind(p.kind); }}
              className="w-full text-left group flex items-center gap-3 px-4 py-2 hover:bg-primary/5 transition-colors"
            >
              <div className="shrink-0">
                <FolderKanban className="h-4 w-4 text-primary/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium truncate text-foreground group-hover:text-primary">
                    {p.client || p.name}
                  </h4>
                  {p.booking_number && (
                    <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                      #{p.booking_number}
                    </span>
                  )}
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] shrink-0">
                    Medel
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(p.eventdate)}
                  </span>
                  {p.deliveryaddress && (
                    <span className="flex items-center gap-1 truncate max-w-[260px]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {p.deliveryaddress}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 hover:bg-primary/15 hover:text-primary shrink-0"
                onClick={(e) => { e.stopPropagation(); setOpenId(p.id); setOpenKind(p.kind); }}
              >
                Planera
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </button>
          ))}
        </div>
      </div>
      )}

      {openId && openKind && (
        <ProjectPlanningSheet
          projectId={openId}
          projectKind={openKind}
          open={true}
          onClose={() => { setOpenId(null); setOpenKind(null); }}
        />
      )}
    </>
  );
};
