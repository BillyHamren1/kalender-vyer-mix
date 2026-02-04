import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface CompletedPacking {
  id: string;
  name: string;
  completedAt: string;
}

interface CompletedPackingsCardProps {
  packings: CompletedPacking[];
  isLoading: boolean;
  weekNumber: string;
}

const CompletedPackingsCard = ({ packings, isLoading, weekNumber }: CompletedPackingsCardProps) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Slutförda vecka {weekNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Slutförda vecka {weekNumber}
          {packings.length > 0 && (
            <Badge variant="secondary" className="ml-auto bg-emerald-100 text-emerald-800">
              {packings.length} st
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {packings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 px-4">
            Inga slutförda denna vecka
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
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-medium text-sm truncate flex-1">{packing.name}</h4>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(packing.completedAt), 'd MMM', { locale: sv })}
                    </span>
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

export default CompletedPackingsCard;
