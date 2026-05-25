import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import StaffWeeklyApprovalRow from "./StaffWeeklyApprovalRow";
import type { WeeklyDayCell, WeeklyStaffBundle } from "./weeklyApprovalModel";
import { Inbox, CheckCircle2, ChevronDown } from "lucide-react";

interface Props {
  todo: WeeklyStaffBundle[];
  approved: WeeklyStaffBundle[];
  openStaffId: string | null;
  onOpen: (staffId: string) => void;
  approvingStaffId: string | null;
  onApproveWeek: (staffId: string) => void;
  onOpenDay?: (bundle: WeeklyStaffBundle, day: WeeklyDayCell) => void;
}


const APPROVED_COLLAPSED_LIMIT = 8;

export const StaffWeeklyApprovalList: React.FC<Props> = ({
  todo,
  approved,
  openStaffId,
  onOpen,
  approvingStaffId,
  onApproveWeek,
  onOpenDay,
}) => {

  const [showAllApproved, setShowAllApproved] = useState(false);
  const approvedToRender = showAllApproved
    ? approved
    : approved.slice(0, APPROVED_COLLAPSED_LIMIT);
  const hiddenApproved = approved.length - approvedToRender.length;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <header className="flex items-center gap-2 px-1">
          <Inbox className="h-3.5 w-3.5 text-amber-600" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Att göra
            <span className="ml-1 text-foreground">({todo.length})</span>
          </h2>
        </header>
        {todo.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
            <CheckCircle2 className="h-4 w-4" />
            Alla rapporter för veckan är hanterade.
          </div>
        ) : (
          <div className="space-y-1">
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

      {approved.length > 0 && (
        <section className="space-y-2">
          <header className="flex items-center gap-2 px-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Godkända
              <span className="ml-1 text-foreground">({approved.length})</span>
            </h2>
          </header>
          <div className="space-y-1">
            {approvedToRender.map((b) => (
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
          {hiddenApproved > 0 && (
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => setShowAllApproved(true)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Visa alla godkända ({hiddenApproved} till)
              </Button>
            </div>
          )}
          {showAllApproved && approved.length > APPROVED_COLLAPSED_LIMIT && (
            <div className="flex justify-center pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setShowAllApproved(false)}
              >
                Visa färre
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default StaffWeeklyApprovalList;
