import type { ProjectTask, TaskPhase } from "@/types/project";

export type WorkspaceHealthLevel = "good" | "attention" | "risk";

export interface WorkspaceAttentionItem {
  id: string;
  label: string;
  detail?: string;
  level: WorkspaceHealthLevel;
}

const dayKey = (value?: string | null) => value ? value.slice(0, 10) : null;

const daysBetween = (from: string, to: string) => {
  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
};

export const getWorkspaceHealth = ({
  tasks,
  projectLeader,
  deliveryAddress,
  rigDate,
  eventDate,
  rigDownDate,
  filesCount,
}: {
  tasks: ProjectTask[];
  projectLeader?: string | null;
  deliveryAddress?: string | null;
  rigDate?: string | null;
  eventDate?: string | null;
  rigDownDate?: string | null;
  filesCount?: number;
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const actionable = tasks.filter((task) => !task.is_info_only);
  const open = actionable.filter((task) => !task.completed);
  const completed = actionable.filter((task) => task.completed);
  const overdue = open.filter((task) => {
    const date = dayKey(task.deadline || task.end_date);
    return !!date && date < today;
  });
  const unassigned = open.filter((task) => !task.assigned_to && !(task.assigned_to_ids?.length));
  const undated = open.filter((task) => !task.deadline && !task.start_date && !task.end_date);
  const upcoming = open
    .filter((task) => dayKey(task.deadline || task.start_date || task.end_date))
    .sort((a, b) => (dayKey(a.deadline || a.start_date || a.end_date) || "9999").localeCompare(dayKey(b.deadline || b.start_date || b.end_date) || "9999"));

  const attention: WorkspaceAttentionItem[] = [];
  // Projektledare saknas är inte kritiskt – ingen varning visas för detta.
  if (!eventDate) attention.push({ id: "event-date", label: "Eventdatum saknas", level: "risk" });
  if (!deliveryAddress) attention.push({ id: "address", label: "Leveransadress saknas", level: "attention" });
  if (overdue.length) attention.push({ id: "overdue", label: `${overdue.length} försenad${overdue.length === 1 ? " aktivitet" : "e aktiviteter"}`, detail: "Prioritera eller planera om", level: "risk" });
  if (unassigned.length) attention.push({ id: "unassigned", label: `${unassigned.length} aktivitet${unassigned.length === 1 ? "" : "er"} saknar ansvarig`, detail: "Tilldela ansvar", level: "attention" });
  if (undated.length >= 3) attention.push({ id: "undated", label: `${undated.length} öppna aktiviteter saknar datum`, detail: "Placera dem i planeringen", level: "attention" });

  const rig = dayKey(rigDate);
  if (rig) {
    const days = daysBetween(today, rig);
    if (days >= 0 && days <= 7 && open.length > 0 && completed.length < actionable.length) {
      attention.push({ id: "rig-soon", label: `Rigg om ${days === 0 ? "0 dagar" : `${days} dag${days === 1 ? "" : "ar"}`}`, detail: `${open.length} aktivitet${open.length === 1 ? "" : "er"} återstår`, level: days <= 2 ? "risk" : "attention" });
    }
  }

  const event = dayKey(eventDate);
  if (event && event < today && open.length > 0) {
    attention.push({ id: "post-event-open", label: "Eventdatum har passerat", detail: `${open.length} aktivitet${open.length === 1 ? "" : "er"} återstår före avslut`, level: "attention" });
  }

  if (filesCount === 0 && rig && daysBetween(today, rig) >= 0 && daysBetween(today, rig) <= 14) {
    attention.push({ id: "documents", label: "Projektet saknar uppladdade dokument", detail: "Kontrollera ritning, PM och övrigt underlag", level: "attention" });
  }

  const progress = actionable.length ? Math.round((completed.length / actionable.length) * 100) : 100;
  const overall: WorkspaceHealthLevel = attention.some((item) => item.level === "risk")
    ? "risk"
    : attention.length
      ? "attention"
      : "good";

  return { today, actionable, open, completed, overdue, unassigned, undated, upcoming, attention, progress, overall };
};

export const getCurrentProjectPhase = ({
  rigDate,
  eventDate,
  rigDownDate,
}: {
  rigDate?: string | null;
  eventDate?: string | null;
  rigDownDate?: string | null;
}): TaskPhase => {
  const today = new Date().toISOString().slice(0, 10);
  const rig = dayKey(rigDate);
  const event = dayKey(eventDate);
  const down = dayKey(rigDownDate);

  if (down && today > down) return "post";
  if (event && today === event) return "live";
  if (event && today > event && (!down || today <= down)) return "teardown";
  if (rig && today >= rig && (!event || today < event)) return "setup";
  if (rig) {
    const days = daysBetween(today, rig);
    if (days <= 14) return "planning";
  }
  return "preproduction";
};
