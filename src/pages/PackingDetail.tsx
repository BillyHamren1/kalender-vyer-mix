import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Phone, User, Package, ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PackingStatusDropdown from "@/components/packing/PackingStatusDropdown";
import PackingTaskList from "@/components/packing/PackingTaskList";
import PackingFiles from "@/components/packing/PackingFiles";
import PackingComments from "@/components/packing/PackingComments";
import PackingGanttChart from "@/components/packing/PackingGanttChart";
import PackingTaskDetailSheet from "@/components/packing/PackingTaskDetailSheet";
import PackingListTab from "@/components/packing/PackingListTab";
import { ProductsList } from "@/components/booking/ProductsList";
import { usePackingDetail } from "@/hooks/usePackingDetail";
import { usePackingList } from "@/hooks/usePackingList";
import { fetchPackingProducts } from "@/services/packingService";
import { PackingTask } from "@/types/packing";
import { BookingProduct } from "@/types/booking";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { toast } from "sonner";

interface ProductChanges {
  added: string[];
  removed: string[];
  updated: string[];
}

const PackingDetail = () => {
  const { packingId } = useParams<{ packingId: string }>();
  const navigate = useNavigate();
  const [selectedTask, setSelectedTask] = useState<PackingTask | null>(null);
  const [products, setProducts] = useState<BookingProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const previousProductsRef = useRef<BookingProduct[]>([]);
  const loadRequestIdRef = useRef(0);
  const lastNotifiedSignatureRef = useRef<string | null>(null);
  
  const {
    packing,
    tasks,
    comments,
    files,
    isLoading,
    updateStatus,
    addTask,
    updateTask,
    deleteTask,
    addComment,
    uploadFile,
    deleteFile,
    isUploadingFile,
    refetchAll
  } = usePackingDetail(packingId || '');

  const {
    items: packingListItems,
    isLoading: isLoadingPackingList,
    updateItem: updatePackingListItem,
    markAllPacked,
    syncPackingList,
    refetchItems
  } = usePackingList(packingId || '');

  const makeProductsSignature = useCallback((list: BookingProduct[]) => {
    return list.map((p) => `${p.id}:${p.quantity}`).sort().join("|");
  }, []);

  const detectProductChanges = useCallback((oldProducts: BookingProduct[], newProducts: BookingProduct[]): ProductChanges | null => {
    if (oldProducts.length === 0) return null;
    const oldById = new Map(oldProducts.map((p) => [p.id, p]));
    const newById = new Map(newProducts.map((p) => [p.id, p]));
    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];
    for (const [id, p] of newById.entries()) {
      const old = oldById.get(id);
      if (!old) { added.push(p.name); }
      else if (old.quantity !== p.quantity) { updated.push(`${p.name}: ${old.quantity} → ${p.quantity}`); }
    }
    for (const [id, p] of oldById.entries()) {
      if (!newById.has(id)) removed.push(p.name);
    }
    if (added.length === 0 && removed.length === 0 && updated.length === 0) return null;
    return { added, removed, updated };
  }, []);

  const loadProducts = useCallback(async (showChanges = false) => {
    if (!packing?.booking_id) return;
    const requestId = ++loadRequestIdRef.current;
    setIsLoadingProducts(true);
    try {
      const productsData = await fetchPackingProducts(packing.booking_id);
      if (requestId !== loadRequestIdRef.current) return;
      if (showChanges && previousProductsRef.current.length > 0) {
        const changes = detectProductChanges(previousProductsRef.current, productsData);
        const newSignature = makeProductsSignature(productsData);
        if (changes && newSignature !== lastNotifiedSignatureRef.current) {
          lastNotifiedSignatureRef.current = newSignature;
          toast.info(`Produktlistan uppdaterad: ${changes.added.length} nya, ${changes.removed.length} borttagna, ${changes.updated.length} ändrade`, { duration: 5000 });
          syncPackingList();
        }
      }
      previousProductsRef.current = productsData;
      setProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      if (requestId === loadRequestIdRef.current) { setIsLoadingProducts(false); }
    }
  }, [detectProductChanges, makeProductsSignature, packing?.booking_id, syncPackingList]);

  useEffect(() => { loadProducts(false); }, [packing?.booking_id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchAll(), refetchItems()]);
      await loadProducts(true);
      toast.success("Data uppdaterad");
    } catch (error) {
      console.error('Error refreshing:', error);
      toast.error("Kunde inte uppdatera data");
    } finally { setIsRefreshing(false); }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && packingId) {
        console.log('[PackingDetail] Tab became visible, refreshing data...');
        refetchAll();
        refetchItems();
        loadProducts(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, [packingId, refetchAll, refetchItems, loadProducts]);

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px]">
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-card rounded-2xl border border-border/40" />
            <div className="h-32 bg-card rounded-2xl border border-border/40" />
          </div>
        </div>
      </div>
    );
  }

  if (!packing) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px] text-center">
          <div className="rounded-2xl bg-card border border-border/40 shadow-2xl p-12">
            <h2 className="text-xl font-semibold text-[hsl(var(--heading))] mb-4">Packningen hittades inte</h2>
            <Button onClick={() => navigate(-1)} variant="outline" className="border-border/60">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Tillbaka
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const booking = packing.booking;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />

        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px]">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 p-7 rounded-2xl bg-card border border-border/40 shadow-2xl">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-accent/50">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shadow-warehouse/15"
                style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
              >
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--heading))]">{packing.name}</h1>
                {booking && (
                  <p className="text-muted-foreground text-[0.925rem]">
                    Kopplat till bokning: {booking.booking_number || booking.id}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="border-border/60"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Uppdatera
              </Button>
              <PackingStatusDropdown 
                status={packing.status} 
                onStatusChange={updateStatus} 
              />
            </div>
          </div>

          {/* Compact Booking Info */}
          {booking && (
            <div className="mb-4 px-5 py-3.5 bg-background/60 backdrop-blur-sm rounded-xl border border-border/30">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{booking.client}</span>
                  </div>
                  {booking.eventdate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{format(new Date(booking.eventdate), 'd MMM yyyy', { locale: sv })}</span>
                    </div>
                  )}
                  {booking.deliveryaddress && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{booking.deliveryaddress}</span>
                    </div>
                  )}
                  {booking.contact_name && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{booking.contact_name}</span>
                    </div>
                  )}
                </div>
                <Link to={`/booking/${booking.id}`}>
                  <Button variant="outline" size="sm" className="h-7 text-xs border-border/60">Visa bokning</Button>
                </Link>
              </div>
            </div>
          )}

          {/* Tabs Content */}
          <div className="rounded-2xl bg-card border border-border/40 shadow-2xl p-7">
            <Tabs defaultValue="packlist" className="space-y-4">
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="packlist" className="flex items-center gap-1">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Packlista
                </TabsTrigger>
                <TabsTrigger value="gantt">Gantt-schema</TabsTrigger>
                <TabsTrigger value="tasks">Uppgifter ({tasks.length})</TabsTrigger>
                {booking && (
                  <TabsTrigger value="products" className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    Produkter ({products.length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="files">Filer ({files.length})</TabsTrigger>
                <TabsTrigger value="comments">Kommentarer ({comments.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="packlist">
                <PackingListTab
                  packingId={packingId || ''}
                  packingName={packing.name}
                  items={packingListItems}
                  isLoading={isLoadingPackingList}
                  onUpdateItem={updatePackingListItem}
                  onMarkAllPacked={() => markAllPacked("Okänd")}
                />
              </TabsContent>

              <TabsContent value="gantt">
                <PackingGanttChart 
                  tasks={tasks}
                  rigDate={booking?.rigdaydate}
                  eventDate={booking?.eventdate}
                  rigdownDate={booking?.rigdowndate}
                  onTaskClick={setSelectedTask}
                />
              </TabsContent>

              <TabsContent value="tasks">
                <div className="rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm p-5">
                  <h3 className="font-semibold text-lg text-[hsl(var(--heading))] mb-4">Uppgifter</h3>
                  <PackingTaskList
                    tasks={tasks}
                    onAddTask={(task) => addTask(task)}
                    onUpdateTask={(data) => updateTask(data)}
                    onDeleteTask={deleteTask}
                  />
                </div>
              </TabsContent>

              {booking && (
                <TabsContent value="products">
                  <div className="rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm p-5">
                    <h3 className="font-semibold text-lg text-[hsl(var(--heading))] flex items-center gap-2 mb-4">
                      <Package className="h-5 w-5" />
                      Produkter från bokning
                    </h3>
                    {isLoadingProducts ? (
                      <div className="animate-pulse space-y-2">
                        <div className="h-8 bg-muted rounded-lg" />
                        <div className="h-8 bg-muted rounded-lg" />
                        <div className="h-8 bg-muted rounded-lg" />
                      </div>
                    ) : products.length > 0 ? (
                      <ProductsList products={products} showPricing={false} />
                    ) : (
                      <p className="text-muted-foreground text-center py-8 text-[0.925rem]">
                        Inga produkter kopplade till denna bokning
                      </p>
                    )}
                  </div>
                </TabsContent>
              )}

              <TabsContent value="files">
                <PackingFiles
                  files={files}
                  onUpload={uploadFile}
                  onDelete={deleteFile}
                  isUploading={isUploadingFile}
                />
              </TabsContent>

              <TabsContent value="comments">
                <PackingComments
                  comments={comments}
                  onAddComment={addComment}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Task Detail Sheet */}
      <PackingTaskDetailSheet
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdateTask={(data) => updateTask(data)}
        onDeleteTask={(id) => {
          deleteTask(id);
          setSelectedTask(null);
        }}
      />
    </div>
  );
};

export default PackingDetail;
