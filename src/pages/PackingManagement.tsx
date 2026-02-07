import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PackingCard from "@/components/packing/PackingCard";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import { fetchPackings, deletePacking } from "@/services/packingService";
import { PackingStatus, PACKING_STATUS_LABELS } from "@/types/packing";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";

const PackingManagement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackingStatus | "all">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: packings = [], isLoading } = useQuery({
    queryKey: ['packings'],
    queryFn: fetchPackings
  });

  const deleteMutation = useMutation({
    mutationFn: deletePacking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packings'] });
      toast.success('Packning borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort packning')
  });

  const filteredPackings = packings.filter(packing => {
    const matchesSearch = packing.name.toLowerCase().includes(search.toLowerCase()) ||
      packing.booking?.client?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || packing.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handlePackingClick = (packingId: string) => {
    navigate(`/warehouse/packing/${packingId}`);
  };

  const handleDelete = (packingId: string) => {
    if (confirm('Är du säker på att du vill ta bort denna packning?')) {
      deleteMutation.mutate(packingId);
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />

        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px]">
          {/* Header */}
          <PageHeader
            icon={Package}
            title="Planera packning"
            subtitle="Hantera packningsprojekt och uppgifter"
            variant="warehouse"
            action={{
              label: "Ny packning",
              icon: Plus,
              onClick: () => setIsCreateOpen(true)
            }}
          />

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök packning..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 rounded-xl border-border/40"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PackingStatus | "all")}>
              <SelectTrigger className="w-[180px] rounded-xl border-border/40">
                <SelectValue placeholder="Filtrera status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla statusar</SelectItem>
                {Object.entries(PACKING_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Packing Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-card animate-pulse rounded-2xl border border-border/40" />
              ))}
            </div>
          ) : filteredPackings.length === 0 ? (
            <div className="text-center py-16 rounded-2xl bg-card border border-border/40 shadow-2xl">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[hsl(var(--heading))] mb-2">Inga packningar hittades</h3>
              <p className="text-muted-foreground mb-4 text-[0.925rem]">
                {search || statusFilter !== "all" 
                  ? "Prova att ändra dina filter" 
                  : "Skapa din första packning för att komma igång"}
              </p>
              {!search && statusFilter === "all" && (
                <Button className="bg-warehouse hover:bg-warehouse-hover shadow-xl shadow-warehouse/25 font-semibold" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Skapa packning
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPackings.map(packing => (
                <PackingCard
                  key={packing.id}
                  packing={packing}
                  onClick={() => handlePackingClick(packing.id)}
                  onDelete={() => handleDelete(packing.id)}
                />
              ))}
            </div>
          )}

          <CreatePackingWizard 
            open={isCreateOpen} 
            onOpenChange={setIsCreateOpen}
            onSuccess={() => {
              setIsCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ['packings'] });
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default PackingManagement;
