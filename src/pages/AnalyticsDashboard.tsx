import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, FolderOpen, Package, Users, GitBranch, AlertTriangle, Download } from 'lucide-react';
import { useDerivedAnalytics, type AnalyticsFilter } from '@/hooks/useDerivedAnalytics';
import { AnalyticsFilterBar } from '@/components/analytics/AnalyticsFilterBar';
import { OverviewTab } from '@/components/analytics/OverviewTab';
import { ProjectAnalysisTab } from '@/components/analytics/ProjectAnalysisTab';
import { ProductAnalysisTab } from '@/components/analytics/ProductAnalysisTab';
import { CombinationAnalysisTab } from '@/components/analytics/CombinationAnalysisTab';
import { StaffAnalysisTab } from '@/components/analytics/StaffAnalysisTab';
import { DeviationAnalysisTab } from '@/components/analytics/DeviationAnalysisTab';
import { AnalyticsExportPanel } from '@/components/analytics/AnalyticsExportPanel';

const AnalyticsDashboard = () => {
  const [filter, setFilter] = useState<AnalyticsFilter>({});
  const { projects, products, combinations, staff, periods, filterValues, isLoading } = useDerivedAnalytics(filter);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analys & Rapporter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analysera lönsamhet, trender och mönster över alla avslutade projekt
        </p>
      </div>

      {/* Filters */}
      <AnalyticsFilterBar filter={filter} onChange={setFilter} filterValues={filterValues} />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="overview" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Översikt
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-1.5 text-xs">
              <FolderOpen className="h-3.5 w-3.5" />
              Projekt
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5 text-xs">
              <Package className="h-3.5 w-3.5" />
              Produkter
            </TabsTrigger>
            <TabsTrigger value="combinations" className="gap-1.5 text-xs">
              <GitBranch className="h-3.5 w-3.5" />
              Kombinationer
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Personal
            </TabsTrigger>
            <TabsTrigger value="deviations" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              Avvikelser
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab periods={periods} projects={projects} />
          </TabsContent>

          <TabsContent value="projects">
            <ProjectAnalysisTab projects={projects} />
          </TabsContent>

          <TabsContent value="products">
            <ProductAnalysisTab products={products} />
          </TabsContent>

          <TabsContent value="combinations">
            <CombinationAnalysisTab combinations={combinations} />
          </TabsContent>

          <TabsContent value="staff">
            <StaffAnalysisTab staff={staff} periods={periods} />
          </TabsContent>

          <TabsContent value="deviations">
            <DeviationAnalysisTab projects={projects} products={products} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
