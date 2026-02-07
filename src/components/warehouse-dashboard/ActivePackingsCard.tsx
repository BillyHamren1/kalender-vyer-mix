import { Package, Clock, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface ActivePacking {
  id: string;
  name: string;
  status: string;
  progress: number;
  totalItems: number;
  packedItems: number;
  projectLeader: string | null;
  updatedAt: string;
}

interface ActivePackingsCardProps {
  packings: ActivePacking[];
  isLoading: boolean;
}

const statusColors: Record<string, string> = {
  planning: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  ready: 'bg-green-100 text-green-800'
};

const statusLabels: Record<string, string> = {
  planning: 'Planering',
  in_progress: 'Pågående',
  ready: 'Klar'
};

const ActivePackingsCard = ({ packings, isLoading }: ActivePackingsCardProps) => {
  const navigate = useNavigate();

  return (
    <div className="h-full rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md shadow-warehouse/15"
              style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
            >
              <Package className="w-4.5 h-4.5 text-white" />
            </div>
            <h3 className="font-semibold text-lg text-[hsl(var(--heading))]">
              Pågående packningar ({packings.length})
            </h3>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/warehouse/packing')}
            className="text-warehouse font-medium"
          >
            Alla packningar →
          </Button>
        </div>
      </div>
      <div className="px-0">
        {isLoading ? (
          <div className="px-5 pb-5 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : packings.length === 0 ? (
          <p className="text-[0.925rem] text-muted-foreground text-center py-6 px-4">
            Inga pågående packningar
          </p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-5 pb-5 space-y-2">
              {packings.map((packing) => (
                <div
                  key={packing.id}
                  className="p-4 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm cursor-pointer hover:-translate-y-0.5 hover:border-warehouse/40 hover:shadow-md transition-all duration-200"
                  onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-medium text-sm truncate flex-1">{packing.name}</h4>
                    <Badge className={`text-xs shrink-0 ${statusColors[packing.status] || 'bg-muted'}`}>
                      {statusLabels[packing.status] || packing.status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {packing.projectLeader && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {packing.projectLeader}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(packing.updatedAt), 'd MMM', { locale: sv })}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Progress value={packing.progress} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground shrink-0">
                        {packing.packedItems}/{packing.totalItems}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default ActivePackingsCard;
