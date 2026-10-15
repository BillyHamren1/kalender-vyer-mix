import { supabase } from "@/integrations/supabase/client";
import { updateBookingFieldsViaSource } from "@/services/booking/liveBookingService";

export type SupplierRequestThread = {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  status: string;
  response_message: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
};

export async function fetchSupplierRequestThreads(projectId: string): Promise<SupplierRequestThread[]> {
  const { data, error } = await supabase
    .from("supplier_request_threads")
    .select("id,recipient_email,recipient_name,subject,status,response_message,sent_at,responded_at,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveSimpleProjectNotes(projectId: string, bookingId: string | null, notes: string) {
  if (bookingId) return updateBookingFieldsViaSource(bookingId, { internalnotes: notes });
  const target = supabase.from("projects").update({ internalnotes: notes }).eq("id", projectId);
  const { error } = await target;
  if (error) throw error;
}

export { SUPPLIER_STATUS as SIMPLE_SUPPLIER_STATUS, THREAD_STATUS as SIMPLE_THREAD_STATUS } from "../../supabase/functions/_shared/operations-project-workspace-presentation";
