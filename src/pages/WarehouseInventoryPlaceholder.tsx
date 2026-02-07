import { Boxes } from "lucide-react";

const WarehouseInventoryPlaceholder = () => {
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px]">
          <div className="max-w-lg mx-auto text-center rounded-2xl border border-border/40 shadow-2xl bg-card p-12">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-warehouse/15"
              style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
            >
              <Boxes className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[hsl(var(--heading))] mb-2">Inventarier</h2>
            <p className="text-muted-foreground text-[0.925rem] leading-relaxed mb-4">
              Denna sektion är under utveckling. Här kommer du kunna hantera lagerinventarier.
            </p>
            <p className="text-sm text-muted-foreground">
              Kommer snart...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarehouseInventoryPlaceholder;
