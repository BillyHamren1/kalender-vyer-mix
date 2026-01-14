import { Boxes } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import WarehouseTopBar from "@/components/WarehouseTopBar";

const WarehouseInventoryPlaceholder = () => {
  return (
    <div className="min-h-screen bg-background">
      <WarehouseTopBar />
      
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-lg mx-auto text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Boxes className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>Inventarier</CardTitle>
            <CardDescription>
              Denna sektion är under utveckling. Här kommer du kunna hantera lagerinventarier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Kommer snart...
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WarehouseInventoryPlaceholder;
