import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, FileJson, FileSpreadsheet, Brain, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  DATASET_DEFINITIONS,
  DATASET_CATEGORIES,
  fetchDataset,
  toCSV,
  toJSON,
  downloadFile,
  buildAIPayload,
  type DatasetType,
  type DatasetCategory,
} from '@/services/analyticsExportService';
import type { AnalyticsFilter } from '@/hooks/useDerivedAnalytics';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  filter: AnalyticsFilter;
}

type ExportFormat = 'csv' | 'json';

export const AnalyticsExportPanel = ({ filter }: Props) => {
  const [selectedDatasets, setSelectedDatasets] = useState<DatasetType[]>([]);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [exporting, setExporting] = useState(false);
  const [aiLoading, setAiLoading] = useState<DatasetType | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<DatasetCategory>>(new Set(['project']));

  const toggle = (type: DatasetType) => {
    setSelectedDatasets(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleCategory = (cat: DatasetCategory) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const selectAllInCategory = (cat: DatasetCategory) => {
    const catTypes = DATASET_DEFINITIONS.filter(d => d.category === cat).map(d => d.type);
    const allSelected = catTypes.every(t => selectedDatasets.includes(t));
    if (allSelected) {
      setSelectedDatasets(prev => prev.filter(t => !catTypes.includes(t)));
    } else {
      setSelectedDatasets(prev => [...new Set([...prev, ...catTypes])]);
    }
  };

  const handleExport = async () => {
    if (selectedDatasets.length === 0) {
      toast.error('Välj minst ett dataset att exportera');
      return;
    }
    setExporting(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      for (const type of selectedDatasets) {
        const { meta, rows } = await fetchDataset(type, filter);
        if (format === 'csv') {
          downloadFile(toCSV(rows, meta.columns), `${type}_${timestamp}.csv`, 'text/csv');
        } else {
          downloadFile(toJSON(rows, meta), `${type}_${timestamp}.json`, 'application/json');
        }
      }
      toast.success(`${selectedDatasets.length} dataset exporterade`);
    } catch (e) {
      console.error(e);
      toast.error('Export misslyckades');
    } finally {
      setExporting(false);
    }
  };

  const handleAIPipeline = async (type: DatasetType) => {
    setAiLoading(type);
    try {
      const payload = await buildAIPayload(type, filter);
      const { data, error } = await supabase.functions.invoke('analytics-ai-pipeline', {
        body: { dataset: payload },
      });
      if (error) throw error;
      toast.success('AI-analys klar!');
      if (data?.analysis) {
        downloadFile(
          JSON.stringify(data, null, 2),
          `ai_analysis_${type}_${new Date().toISOString().slice(0, 10)}.json`,
          'application/json'
        );
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'AI-pipeline misslyckades');
    } finally {
      setAiLoading(null);
    }
  };

  const filterSummary = [
    filter.startDate && `från ${filter.startDate}`,
    filter.endDate && `till ${filter.endDate}`,
    filter.clientName && `kund: ${filter.clientName}`,
    filter.category && `kategori: ${filter.category}`,
    filter.projectType && `typ: ${filter.projectType}`,
  ].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      {filterSummary && (
        <div className="text-sm text-muted-foreground">
          Aktiva filter: <span className="font-medium text-foreground">{filterSummary}</span>
        </div>
      )}

      {/* Dataset selection by category */}
      <div className="space-y-2">
        {DATASET_CATEGORIES.map(cat => {
          const catDatasets = DATASET_DEFINITIONS.filter(d => d.category === cat.key);
          const selectedCount = catDatasets.filter(d => selectedDatasets.includes(d.type)).length;
          const isOpen = openCategories.has(cat.key);

          return (
            <Collapsible key={cat.key} open={isOpen} onOpenChange={() => toggleCategory(cat.key)}>
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 px-2">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium text-sm">{cat.label}</span>
                  </Button>
                </CollapsibleTrigger>
                <Badge variant="secondary" className="text-[10px]">{catDatasets.length} dataset</Badge>
                {selectedCount > 0 && (
                  <Badge variant="default" className="text-[10px]">{selectedCount} valda</Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground ml-auto"
                  onClick={(e) => { e.stopPropagation(); selectAllInCategory(cat.key); }}
                >
                  {selectedCount === catDatasets.length ? 'Avmarkera alla' : 'Välj alla'}
                </Button>
              </div>
              <CollapsibleContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pl-8 pt-2 pb-3">
                  {catDatasets.map(ds => (
                    <button
                      key={ds.type}
                      onClick={() => toggle(ds.type)}
                      className={`text-left rounded-md border p-3 transition-all ${
                        selectedDatasets.includes(ds.type)
                          ? 'ring-2 ring-primary bg-primary/5 border-primary/30'
                          : 'border-border hover:bg-accent/30'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={selectedDatasets.includes(ds.type)}
                          onCheckedChange={() => toggle(ds.type)}
                          className="mt-0.5"
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium">{ds.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{ds.description}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Export controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Exportera data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={format} onValueChange={v => setFormat(v as ExportFormat)}>
              <SelectTrigger className="w-[140px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">
                  <span className="flex items-center gap-2"><FileSpreadsheet className="h-3.5 w-3.5" /> CSV</span>
                </SelectItem>
                <SelectItem value="json">
                  <span className="flex items-center gap-2"><FileJson className="h-3.5 w-3.5" /> JSON</span>
                </SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleExport} disabled={selectedDatasets.length === 0 || exporting} className="gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportera {selectedDatasets.length > 0 ? `(${selectedDatasets.length})` : ''}
            </Button>

            <span className="text-xs text-muted-foreground">
              {selectedDatasets.length} av {DATASET_DEFINITIONS.length} dataset valda
            </span>
          </div>
        </CardContent>
      </Card>

      {/* AI Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI-analys pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Skicka ett dataset till AI för automatisk insiktsanalys. Varje dataset skickas med metadata, sammanfattning och filtrerade rader.
          </p>
          <div className="space-y-3">
            {DATASET_CATEGORIES.map(cat => {
              const catDatasets = DATASET_DEFINITIONS.filter(d => d.category === cat.key);
              return (
                <div key={cat.key}>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">{cat.label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {catDatasets.map(ds => (
                      <Button
                        key={ds.type}
                        variant="outline"
                        size="sm"
                        className="text-[11px] h-7 gap-1.5 px-2"
                        disabled={aiLoading !== null}
                        onClick={() => handleAIPipeline(ds.type)}
                      >
                        {aiLoading === ds.type ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                        {ds.label}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
