import { useMemo, useState } from "react";
import { addDays, startOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useStaffTimeWeekFlow } from "@/hooks/staffTimeFlow/useStaffTimeWeekFlow";
import { usePendingWeekSubmissions } from "@/hooks/staffTimeFlow/usePendingWeekSubmissions";
import WeekFlowHeader from "./week-flow/WeekFlowHeader";
import WeekFlowDayCard from "./week-flow/WeekFlowDayCard";
import { Loader2 } from "lucide-react";

export default function StaffTimeWeeklyGpsReportContent() {
  const navigate = useNavigate();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [mode, setMode] = useState<"person" | "pending">("person");

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const { flow, isLoading } = useStaffTimeWeekFlow({
    staffId: mode === "person" ? staffId : null,
    weekDates,
    viewer: "admin",
  });

  const pending = usePendingWeekSubmissions(weekDates);

  return (
    <div className="flex flex-col">
      <WeekFlowHeader
        staffId={staffId}
        onStaffChange={(id) => { setStaffId(id); setMode("person"); }}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        mode={mode}
        onModeChange={setMode}
      />

      <div className="p-4 space-y-3">
        {mode === "person" && !staffId && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Välj personal i listan ovan för att se veckans tidrapport.
            <br />
            Klicka på "Väntar godkännande" för att se alla inskickade dagar som behöver attesteras.
          </div>
        )}

        {mode === "person" && staffId && (
          <>
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Laddar veckans tidrapport…
              </div>
            )}
            {flow?.days.map((day) => (
              <WeekFlowDayCard
                key={day.date}
                day={day}
                onOpenGps={(date) => navigate(`/staff-management/time?staff=${staffId}&date=${date}`)}
              />
            ))}
          </>
        )}

        {mode === "pending" && (
          <PendingPanel
            isLoading={pending.isLoading}
            data={pending.data ?? []}
            onPickStaff={(id) => { setStaffId(id); setMode("person"); }}
          />
        )}
      </div>
    </div>
  );
}

function PendingPanel({
  isLoading, data, onPickStaff,
}: {
  isLoading: boolean;
  data: ReturnType<typeof usePendingWeekSubmissions>["data"] extends infer T ? Exclude<T, undefined> : never;
  onPickStaff: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Hämtar inskickade dagar…
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        🎉 Inga dagar väntar på godkännande den här veckan.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {data.map((group) => (
        <button
          key={group.staffId}
          type="button"
          onClick={() => onPickStaff(group.staffId)}
          className="block w-full text-left rounded-lg border bg-card p-3 hover:border-primary transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">{group.staffName ?? "Okänd personal"}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
              {group.days.length} {group.days.length === 1 ? "dag" : "dagar"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.days.map((d) => (
              <span key={d.id} className="text-[11px] px-1.5 py-0.5 rounded bg-muted tabular-nums">
                {d.date.slice(5)} {d.start_time?.slice(0, 5) ?? "—"}–{d.end_time?.slice(0, 5) ?? "—"}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
