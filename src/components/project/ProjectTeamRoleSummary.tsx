import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, UsersRound } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  project_manager: "Projektledare",
  coordinator: "Koordinator",
  team_leader: "Teamledare",
  field: "Fält",
};

interface TeamMemberLike {
  role?: string | null;
}

const ProjectTeamRoleSummary = ({
  members,
  hasProjectLeader,
}: {
  members: TeamMemberLike[];
  hasProjectLeader?: boolean;
}) => {
  const roleCounts = members.reduce<Record<string, number>>((acc, member) => {
    const role = member.role || "field";
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  const hasOperationalLead = !!roleCounts.team_leader || !!roleCounts.coordinator;
  const showLeadWarning = members.length >= 2 && !hasOperationalLead;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Ansvarsfördelning</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{members.length} i projektteamet</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(roleCounts).length === 0 ? (
          <span className="text-xs text-muted-foreground">Inga roller tilldelade ännu.</span>
        ) : Object.entries(roleCounts).map(([role, count]) => (
          <Badge key={role} variant="outline" className="font-normal text-[10px]">
            {ROLE_LABELS[role] || role}: {count}
          </Badge>
        ))}
      </div>
      <div className="space-y-1 text-[11px]">
        {hasProjectLeader === false && (
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Projektet saknar huvudansvarig projektledare.
          </div>
        )}
        {showLeadWarning ? (
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Teamet saknar operativ teamledare/koordinator.
          </div>
        ) : members.length > 0 ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Roller är synliga för projektledningen.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ProjectTeamRoleSummary;
