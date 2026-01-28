import { useState } from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Package, Calendar, Users, Clock, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { 
  BookingProduct, 
  BookingDateInfo, 
  AssignedStaff 
} from "@/services/establishmentPlanningService";

interface EstablishmentDataPanelProps {
  products: BookingProduct[];
  dates: BookingDateInfo | null;
  assignedStaff: AssignedStaff[];
  onDragStart?: (item: { type: 'product' | 'date' | 'staff'; data: any }) => void;
}

const EstablishmentDataPanel = ({ 
  products, 
  dates, 
  assignedStaff,
  onDragStart
}: EstablishmentDataPanelProps) => {
  const [productsOpen, setProductsOpen] = useState(true);
  const [datesOpen, setDatesOpen] = useState(true);
  const [staffOpen, setStaffOpen] = useState(true);

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return null;
    try {
      return format(new Date(timestamp), 'HH:mm');
    } catch {
      return null;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
    } catch {
      return null;
    }
  };

  const dateItems = [
    { 
      label: 'Riggdag', 
      date: dates?.rigdaydate, 
      startTime: dates?.rig_start_time, 
      endTime: dates?.rig_end_time,
      color: 'bg-blue-100 text-blue-800 border-blue-200'
    },
    { 
      label: 'Eventdag', 
      date: dates?.eventdate, 
      startTime: dates?.event_start_time, 
      endTime: dates?.event_end_time,
      color: 'bg-green-100 text-green-800 border-green-200'
    },
    { 
      label: 'Avetablering', 
      date: dates?.rigdowndate, 
      startTime: dates?.rigdown_start_time, 
      endTime: dates?.rigdown_end_time,
      color: 'bg-orange-100 text-orange-800 border-orange-200'
    },
  ].filter(d => d.date);

  // Group staff by date
  const staffByDate = assignedStaff.reduce((acc, staff) => {
    const date = staff.assignment_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(staff);
    return acc;
  }, {} as Record<string, AssignedStaff[]>);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Bokningsdata</CardTitle>
        <p className="text-xs text-muted-foreground">
          Dra objekt till schemat för att planera
        </p>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-4 pb-4">
          <div className="space-y-3">
            {/* Products Section */}
            <Collapsible open={productsOpen} onOpenChange={setProductsOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between px-2 h-8"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4 text-amber-500" />
                    Produkter ({products.length})
                  </span>
                  {productsOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {products.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    Inga produkter
                  </p>
                ) : (
                  products.map((product) => (
                    <div
                      key={product.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'product',
                          data: product
                        }));
                        onDragStart?.({ type: 'product', data: product });
                      }}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md border bg-card",
                        "cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors"
                      )}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        {product.notes && (
                          <p className="text-xs text-muted-foreground truncate">
                            {product.notes}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {product.quantity}
                      </Badge>
                    </div>
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Dates Section */}
            <Collapsible open={datesOpen} onOpenChange={setDatesOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between px-2 h-8"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    Datum & tider ({dateItems.length})
                  </span>
                  {datesOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {dateItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    Inga datum angivna
                  </p>
                ) : (
                  dateItems.map((item) => (
                    <div
                      key={item.label}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          type: 'date',
                          data: item
                        }));
                        onDragStart?.({ type: 'date', data: item });
                      }}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md border",
                        "cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity",
                        item.color
                      )}
                    >
                      <GripVertical className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs opacity-75">
                          {formatDate(item.date)}
                        </p>
                      </div>
                      {(item.startTime || item.endTime) && (
                        <div className="flex items-center gap-1 text-xs opacity-75">
                          <Clock className="h-3 w-3" />
                          {formatTime(item.startTime)} - {formatTime(item.endTime)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Staff Section */}
            <Collapsible open={staffOpen} onOpenChange={setStaffOpen}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between px-2 h-8"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-4 w-4 text-green-500" />
                    Personal ({assignedStaff.length})
                  </span>
                  {staffOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {Object.keys(staffByDate).length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-1">
                    Ingen personal tilldelad
                  </p>
                ) : (
                  Object.entries(staffByDate).map(([date, staffList]) => (
                    <div key={date} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground px-2">
                        {formatDate(date)}
                      </p>
                      {staffList.map((staff, idx) => (
                        <div
                          key={`${staff.id}-${idx}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({
                              type: 'staff',
                              data: staff
                            }));
                            onDragStart?.({ type: 'staff', data: staff });
                          }}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md border bg-green-50 border-green-200",
                            "cursor-grab active:cursor-grabbing hover:bg-green-100 transition-colors"
                          )}
                        >
                          <GripVertical className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-green-900 truncate">
                              {staff.name}
                            </p>
                            {staff.role && (
                              <p className="text-xs text-green-700 truncate">
                                {staff.role}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default EstablishmentDataPanel;
