import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PickupStopsSection from "./PickupStopsSection";
import type { PickupParent } from "@/hooks/usePickupStops";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parent: PickupParent;
  title?: string;
}

export default function PickupStopsDialog({ open, onOpenChange, parent, title }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? "Materialhämtning"}</DialogTitle>
        </DialogHeader>
        <PickupStopsSection parent={parent} title="Hämtningsstopp" compact />
      </DialogContent>
    </Dialog>
  );
}
