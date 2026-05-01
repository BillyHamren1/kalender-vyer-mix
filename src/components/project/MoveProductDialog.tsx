import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductGroup } from "@/hooks/useProductGrouping";

interface MoveProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  currentGroupId: string | null;
  groups: ProductGroup[];
  onMove: (targetGroupId: string) => void;
  onCreateGroup: (name: string) => void;
}

export const MoveProductDialog = ({
  open,
  onOpenChange,
  productName,
  currentGroupId,
  groups,
  onMove,
  onCreateGroup,
}: MoveProductDialogProps) => {
  const [selected, setSelected] = useState<string>(currentGroupId || groups[0]?.id || "");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Flytta "{productName}"</DialogTitle>
        </DialogHeader>

        {!creating ? (
          <div className="space-y-3">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Välj kategori" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              + Skapa ny kategori
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ny kategori..."
            />
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Tillbaka
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          {!creating ? (
            <Button onClick={() => onMove(selected)} disabled={!selected}>
              Flytta
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (newName.trim()) onCreateGroup(newName.trim());
              }}
              disabled={!newName.trim()}
            >
              Skapa & flytta
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
