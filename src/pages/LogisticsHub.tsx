import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate, useLocation } from 'react-router-dom';

const LogisticsPlanning = React.lazy(() => import('./LogisticsPlanning'));
const LogisticsRoutes = React.lazy(() => import('./LogisticsRoutes'));
const LogisticsVehicles = React.lazy(() => import('./LogisticsVehicles'));

const tabTriggerClass =
  "relative px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-primary font-medium transition-colors hover:text-foreground";

const tabMap: Record<string, string> = {
  '/logistics': 'planning',
  '/logistics/planning': 'planning',
  '/logistics/routes': 'routes',
  '/logistics/vehicles': 'vehicles',
};

const routeMap: Record<string, string> = {
  planning: '/logistics/planning',
  routes: '/logistics/routes',
  vehicles: '/logistics/vehicles',
};

const LogisticsHub: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = tabMap[location.pathname] || 'planning';

  const handleTabChange = (value: string) => {
    const route = routeMap[value];
    if (route && route !== location.pathname) {
      navigate(route, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        {/* Premium Header */}
        <div className="relative mb-8">
          <div className="absolute inset-0 -z-10 overflow-hidden rounded-3xl">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-primary/3 rounded-full blur-2xl" />
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-card/80 via-card to-card/80 backdrop-blur-sm border border-border/50 shadow-lg">
            <div className="flex items-center gap-4">
              <div
                className="relative p-3.5 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg"
                style={{ boxShadow: '0 8px 32px hsl(var(--primary) / 0.3)' }}
              >
                <Truck className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Logistikplanering
                </h1>
                <p className="text-muted-foreground mt-0.5">
                  Transport, rutter och fordonshantering
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed content */}
        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="rounded-xl border border-border/40 bg-card px-2 py-1" style={{ boxShadow: '0 1px 3px hsl(200 15% 15% / 0.04)' }}>
            <TabsList className="h-auto p-0 bg-transparent gap-0 w-full grid grid-cols-3">
              <TabsTrigger value="planning" className={tabTriggerClass}>
                Transportbokning
              </TabsTrigger>
              <TabsTrigger value="routes" className={tabTriggerClass}>
                Ruttplanering
              </TabsTrigger>
              <TabsTrigger value="vehicles" className={tabTriggerClass}>
                Fordon & Partners
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="planning">
            <React.Suspense fallback={<Skeleton className="h-96" />}>
              <LogisticsPlanning />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="routes">
            <React.Suspense fallback={<Skeleton className="h-96" />}>
              <LogisticsRoutes />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="vehicles">
            <React.Suspense fallback={<Skeleton className="h-96" />}>
              <LogisticsVehicles />
            </React.Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default LogisticsHub;
