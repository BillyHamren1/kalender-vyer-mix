import React from 'react';
import { Calendar } from 'lucide-react';
import type { PackingWithBooking } from '@/types/packing';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  usePackingsByDate,
  type PackingEntryKind,
} from '@/hooks/scanner/usePackingsByDate';
import PackingCard from './PackingCard';
import LargeProjectPackingCard from './LargeProjectPackingCard';

interface Props {
  date: Date;
  packings: PackingWithBooking[];
  onSelect: (
    packingId: string,
    mode: 'verifying' | 'manual',
    kind: PackingEntryKind,
  ) => void;
  onOpenLargeProject: (
    largeProjectId: string,
    largeProjectName: string,
    kind: PackingEntryKind,
    packings: PackingWithBooking[],
  ) => void;
  onShowWeek?: () => void;
}

const PackingDayView: React.FC<Props> = ({
  date,
  packings,
  onSelect,
  onOpenLargeProject,
  onShowWeek,
}) => {
  const { t } = useLanguage();
  const grouped = usePackingsByDate(packings);
  const day = grouped.getGroupsForDate(date);

  if (day.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <Calendar className="w-6 h-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-semibold text-foreground/70">
          {t('scanner.calendar.noPackingsThisDay')}
        </p>
        {onShowWeek && (
          <button
            type="button"
            onClick={onShowWeek}
            className="text-xs font-semibold text-primary active:opacity-70"
          >
            {t('calendar.showWeek')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {day.map(entry => {
        if (entry.type === 'lp_group') {
          return (
            <LargeProjectPackingCard
              key={entry.key}
              largeProjectId={entry.largeProjectId}
              largeProjectName={entry.largeProjectName}
              kind={entry.kind}
              packings={entry.packings}
              onOpen={onOpenLargeProject}
            />
          );
        }
        return (
          <PackingCard
            key={entry.key}
            packing={entry.packing}
            kind={entry.kind}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
};

export default PackingDayView;
