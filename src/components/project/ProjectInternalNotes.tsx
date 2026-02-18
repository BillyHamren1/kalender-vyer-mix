import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ProjectInternalNotesProps {
  bookingId: string | null;
  currentNotes: string | null | undefined;
  projectId: string;
  className?: string;
}

const ProjectInternalNotes = ({ bookingId, currentNotes, projectId, className }: ProjectInternalNotesProps) => {
  const [notes, setNotes] = useState(currentNotes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const queryClient = useQueryClient();

  // Sync if external data changes (e.g. after refresh)
  useEffect(() => {
    setNotes(currentNotes || "");
    setIsDirty(false);
  }, [currentNotes]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!bookingId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ internalnotes: notes })
        .eq("id", bookingId);

      if (error) throw error;

      setIsDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Interna anteckningar sparade");
    } catch (err) {
      console.error("Error saving internal notes:", err);
      toast.error("Kunde inte spara anteckningar");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className={`border-border/40 shadow-2xl rounded-2xl${className ? ` ${className}` : ""}`}>
      <CardContent className="pt-4 flex flex-col gap-3 h-full">
        <Textarea
          placeholder="Lägg till interna anteckningar..."
          value={notes}
          onChange={handleChange}
          className="flex-1 resize-none min-h-[180px] text-sm"
          disabled={!bookingId}
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || isSaving || !bookingId}
          className="self-end gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? "Sparar..." : "Spara"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ProjectInternalNotes;
