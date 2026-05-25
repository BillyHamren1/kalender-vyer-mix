import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import StaffWeeklyApprovalRow from "./StaffWeeklyApprovalRow";
import type { WeeklyStaffBundle } from "./weeklyApprovalModel";
import { Inbox, CheckCircle2 } from "lucide-react";

interface Props {
  todo: WeeklyStaffBundle[];
  approved: WeeklyStaffBundle[];
  openStaffId: string | null;
  onOpen: (staffId: string) => void;
  approvingStaffId: string | null;
  onApproveWeek: (staffId: string) => void;
}

export const StaffWeeklyApprovalList: React.FC<Props> = ({
  todo,
  approved,
  openStaffId,
  onOpen,
  approvingStaffId,
  onApproveWeek,
}) => {
  return (
    <ScrollArea className="h-[calc(100vh-220px)] pr-2">
      <section className="space-y-2 pb-4">
        <header className="flex items-center gap-2 px-1 pt-2">
          <Inbox className="h-3.5 w-3.5 text-amber-600" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Att göra ({todo.length})
          </h2>
        </header>
        {todo.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed border-border/50 rounded-lg">
            Inga rapporter väntar attest den här veckan.
          </div>
        ) : (
          <div className="space-y-1.5">
            {todo.map((b) => (
              <StaffWeeklyApprovalRow
                key={b.staff.id}
                bundle={b}
                isOpen={openStaffId === b.staff.id}
                isApproving={approvingStaffId === b.staff.id}
                onOpen={() => onOpen(b.staff.id)}
                onApproveWeek={() => onApproveWeek(b.staff.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2 pb-6">
        <header className="flex items-center gap-2 px-1 pt-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Godkända ({approved.length})
          </h2>
        </header>
        {approved.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed border-border/50 rounded-lg">
            Ingen vecka är helt godkänd ännu.
          </div>
        ) : (
          <div className="space-y-1.5">
            {approved.map((b) => (
              <StaffWeeklyApprovalRow
                key={b.staff.id}
                bundle={b}
                isOpen={openStaffId === b.staff.id}
                isApproving={approvingStaffId === b.staff.id}
                onOpen={() => onOpen(b.staff.id)}
                onApproveWeek={() => onApproveWeek(b.staff.id)}
              />
            ))}
          </div>
        )}
      </section>
    </ScrollArea>
  );
};

export default StaffWeeklyApprovalList;
