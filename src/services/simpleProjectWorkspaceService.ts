import { supabase } from "@/integrations/supabase/client";

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
  const target = bookingId
    ? supabase.from("bookings").update({ internalnotes: notes }).eq("id", bookingId)
    : supabase.from("projects").update({ internalnotes: notes }).eq("id", projectId);
  const { error } = await target;
  if (error) throw error;
}

export const SIMPLE_SUPPLIER_STATUS: Record<string, string> = {
  draft: "Inte kontaktad",
  request_sent: "Väntar på svar",
  quote_received: "Svar mottaget",
  negotiating: "Svar mottaget",
  confirmed: "Bekräftad",
  cancelled: "Avböjt",
};

export const SIMPLE_THREAD_STATUS: Record<string, string> = {
  sending: "Skickar",
  sent: "Väntar på svar",
  replied: "Svar mottaget",
  confirmed: "Bekräftad",
  declined: "Avböjt",
  failed: "Misslyckades",
};
