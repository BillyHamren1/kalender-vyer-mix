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
    { key: 'list', label: t('calendar.list') },
  ];
  return (
    <div className="inline-flex w-full p-1 rounded-xl bg-muted border border-border">
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95',
              active
                ? 'bg-card text-foreground shadow-sm'
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
