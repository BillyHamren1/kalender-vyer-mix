import { Calendar, Trash2, CheckSquare } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{packing.name}</h3>
            {packing.booking && (
              <p className="text-sm text-muted-foreground truncate">
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
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
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

        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <CheckSquare className="h-4 w-4" />
          <span>Skapad {format(new Date(packing.created_at), 'd MMM yyyy', { locale: sv })}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default PackingCard;
