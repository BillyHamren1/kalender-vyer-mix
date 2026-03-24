import { useState } from "react";
import { useProjectSuppliers } from "@/hooks/useProjectSuppliers";
import SupplierCard from "./SupplierCard";
import SupplierDetailSheet from "./SupplierDetailSheet";
import AddSupplierDialog from "./AddSupplierDialog";
import { Button } from "@/components/ui/button";
import type { ProjectSupplier } from "@/types/supplier";
import { Plus, Truck } from "lucide-react";

interface ProjectSuppliersTabProps {
  projectId: string;
}

const ProjectSuppliersTab = ({ projectId }: ProjectSuppliersTabProps) => {
  const { suppliers, isLoading, addSupplier, updateSupplier, deleteSupplier, setStatus } = useProjectSuppliers(projectId);
  const [selectedSupplier, setSelectedSupplier] = useState<ProjectSupplier | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const handleCardClick = (supplier: ProjectSupplier) => {
    setSelectedSupplier(supplier);
    setSheetOpen(true);
  };

  // Keep sheet supplier in sync with data
  const liveSupplier = selectedSupplier
    ? suppliers.find(s => s.id === selectedSupplier.id) || selectedSupplier
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Laddar underleverantörer...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
            <Truck className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">Underleverantörer</h2>
          {suppliers.length > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
              {suppliers.length}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Lägg till
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-1">Inga underleverantörer</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Lägg till underleverantörer för att hantera förfrågningar, offerter och bekräftelser.
          </p>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Lägg till underleverantör
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suppliers.map(supplier => (
            <SupplierCard key={supplier.id} supplier={supplier} onClick={() => handleCardClick(supplier)} />
          ))}
        </div>
      )}

      <AddSupplierDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={addSupplier}
        projectId={projectId}
      />

      <SupplierDetailSheet
        supplier={liveSupplier}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onStatusChange={(id, status) => setStatus({ id, status })}
        onUpdate={(id, updates) => updateSupplier({ id, updates })}
        onDelete={deleteSupplier}
      />
    </div>
  );
};

export default ProjectSuppliersTab;
