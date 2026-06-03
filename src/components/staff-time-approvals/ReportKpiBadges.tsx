/**
 * ReportKpiBadges — Normal / Övertid / Resa / Total som premium-pills i header.
 */
import { Clock, Sunrise, Plane, Hourglass } from "lucide-react";

function fmtH(min: number): string {
  if (!min || min <= 0) return "0:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

interface Props {
  normal: number;
  overtime: number;
  travel: number;
  total: number;
}

const ITEMS: Array<{
  key: keyof Props;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
  iconClass: string;
}> = [
  { key: "normal",   label: "Normal",  icon: Clock,     className: "bg-slate-50 border-slate-200 text-slate-900",            iconClass: "text-slate-500" },
  { key: "overtime", label: "Övertid", icon: Sunrise,   className: "bg-amber-50 border-amber-200 text-amber-900",            iconClass: "text-amber-600" },
  { key: "travel",   label: "Resa",    icon: Plane,     className: "bg-sky-50 border-sky-200 text-sky-900",                  iconClass: "text-sky-600" },
  { key: "total",    label: "Totalt",  icon: Hourglass, className: "bg-violet-50 border-violet-200 text-violet-900 font-semibold", iconClass: "text-violet-600" },
];

export default function ReportKpiBadges(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ITEMS.map(({ key, label, icon: Icon, className, iconClass }) => (
        <div
          key={key}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] leading-none ${className}`}
        >
          <Icon className={`h-3.5 w-3.5 ${iconClass}`} />
          <span className="uppercase tracking-wider text-[10px] opacity-70">{label}</span>
          <span className="tabular-nums text-[13px]">{fmtH(props[key])}</span>
        </div>
      ))}
    </div>
  );
}
