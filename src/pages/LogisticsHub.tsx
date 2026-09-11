import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 theme-purple">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        <PageHeader
          icon={Truck}
          title="Transportplanering"
          subtitle="Transport, rutter och fordonshantering"
          variant="purple"
        />

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
