import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Skickar leverantörsförfrågan via Edge Function `send-supplier-request`.
 * Organisation och avsändardomän härleds serverside från leverantörskopplingen –
 * klienten skickar aldrig organisation eller avsändaradress.
 */
export const useSupplierRequests = () => {
  const [isSending, setIsSending] = useState(false);

  const sendSupplierRequest = async (params: {
    projectSupplierLinkId: string;
    message: string;
    subject?: string;
  }): Promise<boolean> => {
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-supplier-request", {
        body: {
          project_supplier_link_id: params.projectSupplierLinkId,
          message: params.message,
          subject: params.subject ?? null,
        },
      });

      if (error) {
        const details = (error as any)?.context
          ? await (error as any).context.text().catch(() => error.message)
          : error.message;
        throw new Error(details || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Förfrågan skickad till ${(data as any)?.sent_to ?? "leverantören"}`);
      return true;
    } catch (err: any) {
      console.error("[useSupplierRequests] send failed", err);
      toast.error("Kunde inte skicka förfrågan: " + (err.message || "okänt fel"));
      return false;
    } finally {
      setIsSending(false);
    }
  };

  return { sendSupplierRequest, isSending };
};
