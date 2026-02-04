import { Package, Clock, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Package className="w-4 h-4 text-warehouse" />
            Pågående packningar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Package className="w-4 h-4 text-warehouse" />
            Pågående packningar ({packings.length})
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/warehouse/packing')}
            className="text-warehouse"
          >
            Alla packningar →
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {packings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 px-4">
            Inga pågående packningar
          </p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-4 pb-4 space-y-2">
              {packings.map((packing) => (
                <div
                  key={packing.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
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
      </CardContent>
    </Card>
  );
};

export default ActivePackingsCard;
