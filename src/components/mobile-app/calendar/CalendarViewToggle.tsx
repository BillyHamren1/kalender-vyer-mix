import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'list';

interface Props {
  value: CalendarViewMode;
  onChange: (m: CalendarViewMode) => void;
}

const CalendarViewToggle = ({ value, onChange }: Props) => {
  const { t } = useLanguage();
  const options: { key: CalendarViewMode; label: string }[] = [
    { key: 'day', label: t('calendar.day') },
    { key: 'week', label: t('calendar.week') },
    { key: 'month', label: t('calendar.month') },
    { key: 'list', label: 'Lista' },
  ];
  return (
    <div className="inline-flex w-full p-1 rounded-full bg-muted/70 border border-border/60">
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              'flex-1 h-8 text-[12px] font-semibold rounded-full transition-all',
              active
                ? 'bg-card text-foreground shadow-[0_1px_3px_hsl(184_30%_15%/0.08)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};


export default CalendarViewToggle;
