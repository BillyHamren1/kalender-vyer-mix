import { useState } from "react";
import { Calendar, Trash2, CheckSquare, History, ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackingWithBooking, PACKING_STATUS_LABELS, PACKING_STATUS_COLORS } from "@/types/packing";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { PackingHistoryDialog } from "@/components/packing/PackingHistoryDialog";
import { ControlCountDialog } from "@/components/packing/ControlCountDialog";

interface PackingCardProps {
  packing: PackingWithBooking;
  onClick: () => void;
  onDelete: () => void;
  onControlCompleted?: (packingId: string, result: "completed" | "failed") => void;
}

const PackingCard = ({ packing, onClick, onDelete, onControlCompleted }: PackingCardProps) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showControl, setShowControl] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const handleHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHistory(true);
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
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleHistory}
              title="Historik"
            >
              <History className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Badge className={PACKING_STATUS_COLORS[packing.status]}>
            {PACKING_STATUS_LABELS[packing.status]}
          </Badge>
          {packing.control_status === 'completed' && (
            <Badge className="bg-emerald-100 text-emerald-800 gap-1">
              <ShieldCheck className="h-3 w-3" />
              Kontrollerad
            </Badge>
          )}
          {packing.control_status === 'failed' && (
            <Badge className="bg-rose-100 text-rose-800 gap-1">
              <AlertTriangle className="h-3 w-3" />
              Kontrollavvikelse
            </Badge>
          )}
          {packing.control_status === 'in_progress' && (
            <Badge className="bg-amber-100 text-amber-800 gap-1">
              <ShieldCheck className="h-3 w-3" />
              Kontroll pågår
            </Badge>
          )}
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

        {packing.status === 'packed' && packing.control_status !== 'completed' && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full gap-2 border-primary/40 text-primary hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              setShowControl(true);
            }}
          >
            <ShieldCheck className="h-4 w-4" />
            {packing.control_status === 'in_progress'
              ? 'Fortsätt kontrollräkning'
              : packing.control_status === 'failed'
              ? 'Gör om kontrollräkning'
              : 'Starta kontrollräkning'}
          </Button>
        )}
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <PackingHistoryDialog
          packingId={packing.id}
          open={showHistory}
          onOpenChange={setShowHistory}
        />
        <ControlCountDialog
          packingId={packing.id}
          packingName={packing.name}
          open={showControl}
          onOpenChange={setShowControl}
          onCompleted={(result) => onControlCompleted?.(packing.id, result)}
        />
      </div>
    </div>
  );
};

export default PackingCard;
