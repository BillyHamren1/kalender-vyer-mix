import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PackingCard from "@/components/packing/PackingCard";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import WarehouseTopBar from "@/components/WarehouseTopBar";
import { fetchPackings, deletePacking } from "@/services/packingService";
import { PackingStatus, PACKING_STATUS_LABELS } from "@/types/packing";
import { toast } from "sonner";

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
    <div className="min-h-screen bg-background">
      <WarehouseTopBar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Planera packning</h1>
              <p className="text-muted-foreground">Hantera packningsprojekt och uppgifter</p>
            </div>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ny packning
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Sök packning..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PackingStatus | "all")}>
            <SelectTrigger className="w-[180px]">
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
              <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : filteredPackings.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Inga packningar hittades</h3>
            <p className="text-muted-foreground mb-4">
              {search || statusFilter !== "all" 
                ? "Prova att ändra dina filter" 
                : "Skapa din första packning för att komma igång"}
            </p>
            {!search && statusFilter === "all" && (
              <Button onClick={() => setIsCreateOpen(true)}>
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
  );
};

export default PackingManagement;
