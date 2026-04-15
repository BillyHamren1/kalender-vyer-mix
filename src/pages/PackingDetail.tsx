import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar as CalendarIcon, MapPin, Phone, User, Package, ClipboardList, RefreshCw, CheckSquare, Layers, Scissors, LayoutList, FileText, Download } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PACKING_STATUS_LABELS, PACKING_STATUS_COLORS } from "@/types/packing";
import ManualPackingChecklist from "@/components/packing/ManualPackingChecklist";
import PackingFiles from "@/components/packing/PackingFiles";
import PackingComments from "@/components/packing/PackingComments";
import PackingProjectOverview from "@/components/packing/PackingProjectOverview";
import MultiBookingScheduleCard from "@/components/packing/MultiBookingScheduleCard";

import DesktopChecklistView from "@/components/packing/DesktopChecklistView";
import BookingInfoExpanded from "@/components/project/BookingInfoExpanded";
import { ProductsList } from "@/components/booking/ProductsList";
import { usePackingDetail } from "@/hooks/usePackingDetail";
import { usePackingList } from "@/hooks/usePackingList";
import { fetchPackingProducts } from "@/services/packingService";
import { syncBookingToPacking } from "@/services/booking/bookingPackingSyncService";
import { BookingProduct } from "@/types/booking";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProductChanges {
  added: string[];
  removed: string[];
  updated: string[];
}

const PackingDetail = () => {
  const { packingId } = useParams<{ packingId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  const [products, setProducts] = useState<BookingProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const previousProductsRef = useRef<BookingProduct[]>([]);
  const loadRequestIdRef = useRef(0);
  const lastNotifiedSignatureRef = useRef<string | null>(null);

  const {
    packing,
    comments,
    files,
    bookingAttachments,
    isLoading,
    
    addComment,
    uploadFile,
    deleteFile,
    isUploadingFile,
    updatePackingDates,
    refetchAll
  } = usePackingDetail(packingId || '');

  const {
    items: packingListItems,
    bookingGroups,
    isMultiBooking,
    linkedBookingIds,
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
    const added: string[] = [], removed: string[] = [], updated: string[] = [];
    for (const [id, p] of newById.entries()) {
      const old = oldById.get(id);
      if (!old) added.push(p.name);
      else if (old.quantity !== p.quantity) updated.push(`${p.name}: ${old.quantity} → ${p.quantity}`);
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
      // For multi-booking, load products from all linked bookings
      const bookingIdsToLoad = isMultiBooking && linkedBookingIds.length > 0
        ? linkedBookingIds
        : [packing.booking_id];

      const allProducts: BookingProduct[] = [];
      for (const bId of bookingIdsToLoad) {
        const productsData = await fetchPackingProducts(bId);
        allProducts.push(...productsData);
      }

      if (requestId !== loadRequestIdRef.current) return;
      if (showChanges && previousProductsRef.current.length > 0) {
        const changes = detectProductChanges(previousProductsRef.current, allProducts);
        const newSignature = makeProductsSignature(allProducts);
        if (changes && newSignature !== lastNotifiedSignatureRef.current) {
          lastNotifiedSignatureRef.current = newSignature;
          toast.info(`Produktlistan uppdaterad`, { duration: 5000 });
          syncPackingList();
        }
      }
      previousProductsRef.current = allProducts;
      setProducts(allProducts);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      if (requestId === loadRequestIdRef.current) setIsLoadingProducts(false);
    }
  }, [detectProductChanges, makeProductsSignature, packing?.booking_id, syncPackingList, isMultiBooking, linkedBookingIds]);

  useEffect(() => { loadProducts(false); }, [packing?.booking_id, linkedBookingIds.length]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchAll(), refetchItems()]);
      await loadProducts(true);
      toast.success("Data uppdaterad");
    } catch (error) {
      toast.error("Kunde inte uppdatera data");
    } finally { setIsRefreshing(false); }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && packingId) {
        refetchAll();
        refetchItems();
        loadProducts(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [packingId, refetchAll, refetchItems, loadProducts]);

  const handleSplitPacking = async () => {
    if (!packing || !isMultiBooking || linkedBookingIds.length === 0) return;
    setIsSplitting(true);
    try {
      // Create individual packings per booking
      for (const bookingId of linkedBookingIds) {
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('client, eventdate, deliveryaddress, organization_id')
          .eq('id', bookingId)
          .maybeSingle();

        if (!bookingData) continue;

        const dateStr = bookingData.eventdate
          ? format(new Date(bookingData.eventdate), 'd MMMM yyyy', { locale: sv })
          : '';
        const packingName = `${bookingData.client}${dateStr ? ` - ${dateStr}` : ''}`;

        const { error } = await supabase
          .from('packing_projects')
          .insert({
            name: packingName,
            booking_id: bookingId,
            client_name: bookingData.client,
            delivery_address: bookingData.deliveryaddress,
            status: 'planning',
            organization_id: bookingData.organization_id,
          });

        if (!error) {
          syncBookingToPacking(bookingId, bookingData.organization_id);
        }
      }

      // Delete the combined packing project (cascade deletes items + links)
      await supabase.from('packing_projects').delete().eq('id', packing.id);

      toast.success(`Packlistan splittad till ${linkedBookingIds.length} separata packlistor`);
      navigate('/warehouse/packing');
    } catch (err) {
      console.error('Error splitting packing:', err);
      toast.error('Kunde inte splitta packlistan');
    } finally {
      setIsSplitting(false);
    }
  };

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
  const isLargeProject = !!packing.large_project_id;

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
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[hsl(var(--heading))]">{packing.name}</h1>
                  {isLargeProject && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Layers className="h-3 w-3" />
                      Stort projekt
                    </Badge>
                  )}
                </div>
                {booking && !isLargeProject && (
                  <p className="text-muted-foreground text-[0.925rem]">
                    Kopplat till bokning: {booking.booking_number || booking.id}
                  </p>
                )}
                {isMultiBooking && (
                  <p className="text-muted-foreground text-[0.925rem]">
                    {linkedBookingIds.length} bokningar samlade
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="border-border/60">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Uppdatera
              </Button>
              {isMultiBooking && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="border-border/60">
                      <Scissors className="h-4 w-4 mr-1.5" />
                      Splitta
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Splitta till separata packlistor?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Detta skapar {linkedBookingIds.length} separata packlistor (en per bokning) och tar bort den samlade packlistan. Packstatus nollställs.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Avbryt</AlertDialogCancel>
                      <AlertDialogAction onClick={handleSplitPacking} disabled={isSplitting}>
                        {isSplitting ? 'Splittar...' : 'Splitta'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${PACKING_STATUS_COLORS[packing.status] || 'bg-muted text-muted-foreground'}`}>
                {PACKING_STATUS_LABELS[packing.status] || packing.status}
              </span>
            </div>
          </div>

          {/* Booking info / event overview */}
          {booking && !isLargeProject && !isMultiBooking && (
            <BookingInfoExpanded
              booking={booking}
              bookingAttachments={bookingAttachments}
              onBookingUpdated={() => refetchAll()}
              packingStartDate={packing.start_date}
              packingEndDate={packing.end_date}
              onPackingDateChange={updatePackingDates}
            />
          )}

          {isMultiBooking && (
            <MultiBookingScheduleCard
              linkedBookingIds={linkedBookingIds}
              packingStartDate={packing.start_date}
              packingEndDate={packing.end_date}
              onPackingDateChange={updatePackingDates}
              onBookingUpdated={() => refetchAll()}
            />
          )}

          {/* Packing dates for large projects without linked bookings */}
          {!booking && !isMultiBooking && (
            <div className="mb-4">
              <div className="rounded-2xl border border-border/40 shadow-2xl bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
                  >
                    <Package className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Packdatum</span>
                </div>
                <div className="flex items-center gap-x-6 gap-y-2 text-sm">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {packing.start_date ? format(new Date(packing.start_date), 'd MMM yyyy', { locale: sv }) : 'Startdatum'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={packing.start_date ? new Date(packing.start_date) : undefined}
                        onSelect={(date) => updatePackingDates({ start_date: date ? format(date, 'yyyy-MM-dd') : null })}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">→</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {packing.end_date ? format(new Date(packing.end_date), 'd MMM yyyy', { locale: sv }) : 'Slutdatum'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={packing.end_date ? new Date(packing.end_date) : undefined}
                        onSelect={(date) => updatePackingDates({ end_date: date ? format(date, 'yyyy-MM-dd') : null })}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}

          <Tabs value={activeTab || (isLargeProject ? 'overview' : 'checklist')} onValueChange={setActiveTab} className="space-y-4">
            <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm rounded-xl px-2 py-1 mb-4">
              <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
                {isLargeProject && (
                  <TabsTrigger value="overview" className="flex items-center gap-1">
                    <LayoutList className="h-3.5 w-3.5" />
                    Översikt
                  </TabsTrigger>
                )}
                <TabsTrigger value="checklist" className="flex items-center gap-1">
                  <CheckSquare className="h-3.5 w-3.5" />
                  Checklista
                </TabsTrigger>
                {(booking || isMultiBooking) && (
                  <>
                    <TabsTrigger value="packlist" className="flex items-center gap-1">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Packlista
                    </TabsTrigger>
                    <TabsTrigger value="products" className="flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" />
                      Produkter ({products.length})
                    </TabsTrigger>
                  </>
                )}
                <TabsTrigger value="files">Filer ({files.length})</TabsTrigger>
                <TabsTrigger value="comments">Kommentarer ({comments.length})</TabsTrigger>
              </TabsList>
            </div>

          <div className="rounded-2xl bg-card border border-border/40 shadow-2xl p-7">

              {isLargeProject && (
                <TabsContent value="overview">
                  <div className="rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm p-5">
                    <PackingProjectOverview
                      packingId={packingId || ''}
                      largeProjectId={packing.large_project_id || ''}
                      onSyncComplete={() => {
                        refetchAll();
                        refetchItems();
                        loadProducts(false);
                      }}
                      onNavigateToChecklist={() => setActiveTab('packlist')}
                    />
                  </div>
                </TabsContent>
              )}

              <TabsContent value="checklist">
                <div className="rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm p-5">
                  <h3 className="font-semibold text-lg text-[hsl(var(--heading))] mb-4">Manuell packlista</h3>
                  <ManualPackingChecklist packingId={packingId || ''} />
                </div>
              </TabsContent>

              {(booking || isMultiBooking) && (
                <>
                  <TabsContent value="packlist">
                    <div className="rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm p-5">
                      <DesktopChecklistView
                        packingId={packingId || ''}
                        packingName={packing.name}
                      />
                    </div>
                  </TabsContent>

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
                </>
              )}

              <TabsContent value="files">
                <PackingFiles files={files} onUpload={uploadFile} onDelete={deleteFile} isUploading={isUploadingFile} />
              </TabsContent>

              <TabsContent value="comments">
                <PackingComments comments={comments} onAddComment={addComment} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default PackingDetail;
