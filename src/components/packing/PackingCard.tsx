import { Calendar, Trash2, CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackingWithBooking, PACKING_STATUS_LABELS, PACKING_STATUS_COLORS } from "@/types/packing";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface PackingCardProps {
  packing: PackingWithBooking;
  onClick: () => void;
  onDelete: () => void;
}

const PackingCard = ({ packing, onClick, onDelete }: PackingCardProps) => {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div 
      className="rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden cursor-pointer group hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200"
      onClick={onClick}
    >
      <div className="p-7">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-[hsl(var(--heading))] truncate tracking-tight">{packing.name}</h3>
            {packing.booking && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {packing.booking.client}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-2"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Badge className={PACKING_STATUS_COLORS[packing.status]}>
            {PACKING_STATUS_LABELS[packing.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {packing.booking?.eventdate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(packing.booking.eventdate), 'd MMM yyyy', { locale: sv })}
            </div>
          )}
        </div>

        {packing.signed_by && packing.signed_at ? (
          <div className="flex items-center gap-1 text-sm text-primary mt-2">
            <CheckSquare className="h-4 w-4" />
            <span>Signerad av {packing.signed_by}, {format(new Date(packing.signed_at), 'd MMM HH:mm', { locale: sv })}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
            <CheckSquare className="h-4 w-4" />
            <span>Skapad {format(new Date(packing.created_at), 'd MMM yyyy', { locale: sv })}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PackingCard;
