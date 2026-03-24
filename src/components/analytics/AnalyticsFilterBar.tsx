import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { AnalyticsFilter } from '@/hooks/useDerivedAnalytics';

interface Props {
  filter: AnalyticsFilter;
  onChange: (f: AnalyticsFilter) => void;
  filterValues?: {
    clients: string[];
    categories: string[];
    projectTypes: string[];
    geographicAreas: string[];
    staffMembers: { id: string; name: string }[];
  };
}

export const AnalyticsFilterBar = ({ filter, onChange, filterValues }: Props) => {
  const hasFilter = filter.startDate || filter.endDate || filter.clientName || filter.category || filter.projectType;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border border-border">
      <Input
        type="date"
        value={filter.startDate || ''}
        onChange={e => onChange({ ...filter, startDate: e.target.value || undefined })}
        className="w-[150px] text-sm"
        placeholder="Från"
      />
      <Input
        type="date"
        value={filter.endDate || ''}
        onChange={e => onChange({ ...filter, endDate: e.target.value || undefined })}
        className="w-[150px] text-sm"
        placeholder="Till"
      />

      <Select
        value={filter.clientName || '__all__'}
        onValueChange={v => onChange({ ...filter, clientName: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="w-[180px] text-sm">
          <SelectValue placeholder="Alla kunder" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Alla kunder</SelectItem>
          {(filterValues?.clients || []).map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.category || '__all__'}
        onValueChange={v => onChange({ ...filter, category: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="w-[160px] text-sm">
          <SelectValue placeholder="Alla kategorier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Alla kategorier</SelectItem>
          {(filterValues?.categories || []).map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.projectType || '__all__'}
        onValueChange={v => onChange({ ...filter, projectType: v === '__all__' ? undefined : v })}
      >
        <SelectTrigger className="w-[160px] text-sm">
          <SelectValue placeholder="Alla projekttyper" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Alla projekttyper</SelectItem>
          {(filterValues?.projectTypes || []).map(t => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({})}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Rensa
        </Button>
      )}
    </div>
  );
};
