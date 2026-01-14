import { Link } from "react-router-dom";
import { Calendar, Package, Boxes, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import WarehouseTopBar from "@/components/WarehouseTopBar";

const sections = [
  {
    title: "Personalplanering",
    description: "Planera personal för lagerarbete",
    icon: Calendar,
    path: "/warehouse/calendar",
    color: "text-blue-600 bg-blue-100"
  },
  {
    title: "Planera packning",
    description: "Hantera packningsprojekt och uppgifter",
    icon: Package,
    path: "/warehouse/packing",
    color: "text-orange-600 bg-orange-100"
  },
  {
    title: "Inventarier",
    description: "Hantera lagerinventarier",
    icon: Boxes,
    path: "/warehouse/inventory",
    color: "text-green-600 bg-green-100"
  },
  {
    title: "Service",
    description: "Service och underhåll av utrustning",
    icon: Wrench,
    path: "/warehouse/service",
    color: "text-purple-600 bg-purple-100"
  }
];

const WarehouseDashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      <WarehouseTopBar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Lagerdashboard</h1>
          <p className="text-muted-foreground mt-2">
            Välkommen till lagersystemet. Välj en sektion för att komma igång.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.path} to={section.path}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${section.color} mb-4`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="group-hover:text-primary transition-colors">
                      {section.title}
                    </CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WarehouseDashboard;
