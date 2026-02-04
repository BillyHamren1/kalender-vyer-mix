import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { PackingListItem } from "@/types/packing";
import PackingListItemRow from "./PackingListItemRow";

type Props = {
  parent: PackingListItem;
  packageComponents: PackingListItem[];
  accessories: PackingListItem[];
  onUpdate: (id: string, updates: Partial<PackingListItem>) => void;
  defaultOpen?: boolean;
};

const PackingListGroup = ({
  parent,
  packageComponents,
  accessories,
  onUpdate,
  defaultOpen,
}: Props) => {
  const childCount = packageComponents.length + accessories.length;

  const computedDefaultOpen = useMemo(() => {
    if (typeof defaultOpen === "boolean") return defaultOpen;
    return (
      !!parent.isNewlyAdded ||
      packageComponents.some((i) => i.isNewlyAdded) ||
      accessories.some((i) => i.isNewlyAdded)
    );
  }, [defaultOpen, parent.isNewlyAdded, packageComponents, accessories]);

  const [open, setOpen] = useState(computedDefaultOpen);

  if (childCount === 0) {
    return (
      <PackingListItemRow
        item={parent}
        onUpdate={onUpdate}
        isAccessory={false}
        isNewlyAdded={parent.isNewlyAdded}
      />
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 mt-0.5 shrink-0"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Dölj underartiklar" : "Visa underartiklar"}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>

        <div className="flex-1 min-w-0">
          <PackingListItemRow
            item={parent}
            onUpdate={onUpdate}
            isAccessory={false}
            isNewlyAdded={parent.isNewlyAdded}
          />

          <div className="mt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Dölj" : "Visa"} {childCount} underartiklar
            </Button>
          </div>

          <CollapsibleContent className="mt-1 space-y-1">
            {packageComponents.map((comp) => (
              <PackingListItemRow
                key={comp.id}
                item={comp}
                onUpdate={onUpdate}
                isAccessory={true}
                isNewlyAdded={comp.isNewlyAdded}
              />
            ))}

            {accessories.map((acc) => (
              <PackingListItemRow
                key={acc.id}
                item={acc}
                onUpdate={onUpdate}
                isAccessory={true}
                isNewlyAdded={acc.isNewlyAdded}
              />
            ))}
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  );
};

export default PackingListGroup;
