import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { format, addDays, addWeeks, subWeeks, startOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface StaffOption { id: string; name: string }

interface Props {
  staffId: string | null;
  onStaffChange: (id: string) => void;
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  mode: "person" | "pending";
  onModeChange: (m: "person" | "pending") => void;
}

export default function WeekFlowHeader({
  staffId, onStaffChange, weekStart, onWeekChange, mode, onModeChange,
}: Props) {
  const { organizationId } = useCurrentOrg();
  const [staff, setStaff] = useState<StaffOption[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (!alive) return;
      setStaff(((data ?? []) as any[]).map((s) => ({ id: String(s.id), name: String(s.name ?? "—") })));
    })();
    return () => { alive = false; };
  }, [organizationId]);

  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `Vecka ${format(weekStart, "I")} · ${format(weekStart, "d MMM", { locale: sv })} – ${format(weekEnd, "d MMM", { locale: sv })}`;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b bg-card/50">
      <Select value={staffId ?? ""} onValueChange={onStaffChange}>
        <SelectTrigger className="w-[220px] h-9">
          <SelectValue placeholder="Välj personal" />
        </SelectTrigger>
        <SelectContent>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="inline-flex rounded-md border bg-background overflow-hidden">
        <button
          type="button"
          onClick={() => onModeChange("person")}
          className={`px-3 h-9 text-xs font-medium ${mode === "person" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          Personalvy
        </button>
        <button
          type="button"
          onClick={() => onModeChange("pending")}
          className={`px-3 h-9 text-xs font-medium border-l flex items-center gap-1.5 ${mode === "pending" ? "bg-amber-500 text-white" : "hover:bg-muted"}`}
        >
          <Users className="h-3.5 w-3.5" />
          Väntar godkännande
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onWeekChange(subWeeks(weekStart, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium px-2 tabular-nums whitespace-nowrap">{weekLabel}</span>
        <Button variant="ghost" size="icon" onClick={() => onWeekChange(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onWeekChange(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          Idag
        </Button>
      </div>
    </div>
  );
}
