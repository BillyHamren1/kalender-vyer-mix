import { CheckCircle2 } from "lucide-react";
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

  return (
    <div className="h-full rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md shadow-emerald-500/15"
              style={{ background: 'linear-gradient(135deg, hsl(152 60% 45%) 0%, hsl(152 65% 35%) 100%)' }}
            >
              <CheckCircle2 className="w-4.5 h-4.5 text-white" />
            </div>
            <h3 className="font-semibold text-lg text-[hsl(var(--heading))]">
              Slutförda v.{weekNumber}
            </h3>
          </div>
          {packings.length > 0 && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
              {packings.length} st
            </Badge>
          )}
        </div>
      </div>
      <div className="px-0">
        {isLoading ? (
          <div className="px-5 pb-5 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : packings.length === 0 ? (
          <p className="text-[0.925rem] text-muted-foreground text-center py-6 px-4">
            Inga slutförda denna vecka
          </p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-5 pb-5 space-y-2">
              {packings.map((packing) => (
                <div
                  key={packing.id}
                  className="p-4 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm cursor-pointer hover:-translate-y-0.5 hover:border-emerald-400/40 hover:shadow-md transition-all duration-200"
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
      </div>
    </div>
  );
};

export default CompletedPackingsCard;
