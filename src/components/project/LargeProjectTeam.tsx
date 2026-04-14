import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLargeProjectStaff,
  addLargeProjectStaff,
  removeLargeProjectStaff,
  type LargeProjectStaffMember,
} from "@/services/largeProjectService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  largeProjectId: string;
}

const ROLE_LABELS: Record<string, string> = {
  field: "Fält",
  team_leader: "Teamledare",
  coordinator: "Koordinator",
  project_manager: "Projektledare",
};

const LargeProjectTeam = ({ largeProjectId }: Props) => {
  const queryClient = useQueryClient();
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedRole, setSelectedRole] = useState("field");

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ["large-project-staff", largeProjectId],
    queryFn: () => fetchLargeProjectStaff(largeProjectId),
  });

  const { data: allStaff = [] } = useQuery({
    queryKey: ["all-staff-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_members" as any)
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return (data || []) as { id: string; name: string }[];
    },
  });

  const addMutation = useMutation({
    mutationFn: () => addLargeProjectStaff(largeProjectId, selectedStaffId, selectedRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["large-project-staff", largeProjectId] });
      toast.success("Personal tillagd i projektteamet");
      setSelectedStaffId("");
    },
    onError: (e: any) => {
      if (e.message?.includes("duplicate")) {
        toast.error("Personen finns redan i teamet");
      } else {
        toast.error("Kunde inte lägga till personal");
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeLargeProjectStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["large-project-staff", largeProjectId] });
      toast.success("Personal borttagen från projektteamet");
    },
    onError: () => toast.error("Kunde inte ta bort personal"),
  });

  const availableStaff = allStaff.filter(
    (s) => !teamMembers.some((m) => m.staff_id === s.id)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4" />
          Projektteam
          {teamMembers.length > 0 && (
            <Badge variant="secondary" className="ml-1">{teamMembers.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add member */}
        <div className="flex gap-2">
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Välj personal..." />
            </SelectTrigger>
            <SelectContent>
              {availableStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            onClick={() => addMutation.mutate()}
            disabled={!selectedStaffId || addMutation.isPending}
          >
            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {/* Team list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : teamMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ingen personal tillagd i projektteamet ännu.
          </p>
        ) : (
          <div className="space-y-1.5">
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border/50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{member.staff_name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {ROLE_LABELS[member.role] || member.role}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(member.id)}
                  disabled={removeMutation.isPending}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LargeProjectTeam;
