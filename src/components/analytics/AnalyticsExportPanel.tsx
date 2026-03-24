import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileJson, FileSpreadsheet, Brain, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DATASET_DEFINITIONS,
  fetchDataset,
  toCSV,
  toJSON,
  downloadFile,
  buildAIPayload,
  type DatasetType,
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

  const toggle = (type: DatasetType) => {
    setSelectedDatasets(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleExport = async () => {
    if (selectedDatasets.length === 0) {
      toast.error('Välj minst ett dataset att exportera');
      return;
    }
    setExporting(true);
    try {
      for (const type of selectedDatasets) {
        const { meta, rows } = await fetchDataset(type, filter);
        const timestamp = new Date().toISOString().slice(0, 10);
        if (format === 'csv') {
          const content = toCSV(rows, meta.columns);
          downloadFile(content, `${type}_${timestamp}.csv`, 'text/csv');
        } else {
          const content = toJSON(rows, meta);
          downloadFile(content, `${type}_${timestamp}.json`, 'application/json');
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
      
      // Download AI response
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

      {/* Dataset selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DATASET_DEFINITIONS.map(ds => (
          <Card
            key={ds.type}
            className={`cursor-pointer transition-all ${
              selectedDatasets.includes(ds.type) ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-accent/30'
            }`}
            onClick={() => toggle(ds.type)}
          >
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedDatasets.includes(ds.type)}
                  onCheckedChange={() => toggle(ds.type)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{ds.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{ds.description}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ds.columns.slice(0, 4).map(c => (
                      <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                    ))}
                    {ds.columns.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">+{ds.columns.length - 4}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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

            <Button
              onClick={handleExport}
              disabled={selectedDatasets.length === 0 || exporting}
              className="gap-2"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportera {selectedDatasets.length > 0 ? `(${selectedDatasets.length})` : ''}
            </Button>
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
            Skicka ett strukturerat dataset till AI för automatisk insiktsanalys.
            Varje dataset skickas med metadata, sammanfattning och filtrerade rader.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {DATASET_DEFINITIONS.map(ds => (
              <Button
                key={ds.type}
                variant="outline"
                size="sm"
                className="justify-start text-xs gap-2"
                disabled={aiLoading !== null}
                onClick={() => handleAIPipeline(ds.type)}
              >
                {aiLoading === ds.type ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Brain className="h-3.5 w-3.5" />
                )}
                {ds.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
