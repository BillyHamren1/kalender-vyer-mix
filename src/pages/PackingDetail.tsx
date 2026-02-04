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

  // Packing list hook
  const {
    items: packingListItems,
    isLoading: isLoadingPackingList,
    updateItem: updatePackingListItem,
    markAllPacked,
    syncPackingList,
    refetchItems
  } = usePackingList(packingId || '');

  // Create a stable signature of products for deduplication
  const makeProductsSignature = useCallback((list: BookingProduct[]) => {
    return list.map((p) => `${p.id}:${p.quantity}`).sort().join("|");
  }, []);

  // Detect product changes between fetches (by ID)
  const detectProductChanges = useCallback((oldProducts: BookingProduct[], newProducts: BookingProduct[]): ProductChanges | null => {
    if (oldProducts.length === 0) return null;

    const oldById = new Map(oldProducts.map((p) => [p.id, p]));
    const newById = new Map(newProducts.map((p) => [p.id, p]));

    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];

    for (const [id, p] of newById.entries()) {
      const old = oldById.get(id);
      if (!old) {
        added.push(p.name);
      } else if (old.quantity !== p.quantity) {
        updated.push(`${p.name}: ${old.quantity} → ${p.quantity}`);
      }
    }

    for (const [id, p] of oldById.entries()) {
      if (!newById.has(id)) removed.push(p.name);
    }

    if (added.length === 0 && removed.length === 0 && updated.length === 0) return null;
    return { added, removed, updated };
  }, []);

  // Fetch products when we have a booking_id
  const loadProducts = useCallback(async (showChanges = false) => {
    if (!packing?.booking_id) return;

    const requestId = ++loadRequestIdRef.current;
    setIsLoadingProducts(true);

    try {
      const productsData = await fetchPackingProducts(packing.booking_id);

      // Ignore stale/out-of-order responses
      if (requestId !== loadRequestIdRef.current) return;

      // Detect changes if we have previous products
      if (showChanges && previousProductsRef.current.length > 0) {
        const changes = detectProductChanges(previousProductsRef.current, productsData);
        const newSignature = makeProductsSignature(productsData);

        // Only show toast if this is actually new (not the same change set repeated)
        if (changes && newSignature !== lastNotifiedSignatureRef.current) {
          lastNotifiedSignatureRef.current = newSignature;
          
          // Simple toast notification - the packing list UI handles the visual display
          toast.info(
            `Produktlistan uppdaterad: ${changes.added.length} nya, ${changes.removed.length} borttagna, ${changes.updated.length} ändrade`,
            { duration: 5000 }
          );
          
          // Auto-sync the packing list to reflect the changes
          syncPackingList();
        }
      }

      previousProductsRef.current = productsData;
      setProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoadingProducts(false);
      }
    }
  }, [detectProductChanges, makeProductsSignature, packing?.booking_id, syncPackingList]);

  useEffect(() => {
    loadProducts(false);
  }, [packing?.booking_id]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchAll(),
        refetchItems()
      ]);
      await loadProducts(true);
      toast.success("Data uppdaterad");
    } catch (error) {
      console.error('Error refreshing:', error);
      toast.error("Kunde inte uppdatera data");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh on visibility change (tab focus)
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
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [packingId, refetchAll, refetchItems, loadProducts]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!packing) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-4">Packningen hittades inte</h2>
        <Button onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Tillbaka
        </Button>
      </div>
    );
  }

  const booking = packing.booking;

  return (
    <div className="h-full overflow-y-auto bg-background">
      
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{packing.name}</h1>
              {booking && (
                <p className="text-muted-foreground">
                  Kopplat till bokning: {booking.booking_number || booking.id}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isRefreshing}
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
          <div className="mb-4 px-4 py-3 bg-muted/50 rounded-lg border">
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
                <Button variant="outline" size="sm" className="h-7 text-xs">Visa bokning</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Tabs Content */}
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
            <Card>
              <CardHeader>
                <CardTitle>Uppgifter</CardTitle>
              </CardHeader>
              <CardContent>
                <PackingTaskList
                  tasks={tasks}
                  onAddTask={(task) => addTask(task)}
                  onUpdateTask={(data) => updateTask(data)}
                  onDeleteTask={deleteTask}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {booking && (
            <TabsContent value="products">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Produkter från bokning
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingProducts ? (
                    <div className="animate-pulse space-y-2">
                      <div className="h-8 bg-muted rounded" />
                      <div className="h-8 bg-muted rounded" />
                      <div className="h-8 bg-muted rounded" />
                    </div>
                  ) : products.length > 0 ? (
                    <ProductsList products={products} />
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      Inga produkter kopplade till denna bokning
                    </p>
                  )}
                </CardContent>
              </Card>
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