// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { resolveSender, buildReplyTo, SenderNotConfiguredError } from "../_shared/email/senderIdentity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildHtml(params: {
  senderName: string;
  recipientName: string | null;
  projectLabel: string;
  bookingNumber: string | null;
  message: string;
}) {
  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 36px 8px;">
          <p style="margin:0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#7357C8;font-weight:700;">${escapeHtml(params.senderName)}</p>
          <h1 style="margin:8px 0 0;font-size:20px;color:#1a1a2e;">Förfrågan${params.bookingNumber ? ` – ${escapeHtml(params.bookingNumber)}` : ""}</h1>
          <p style="margin:6px 0 0;font-size:14px;color:#5a5a6b;">${escapeHtml(params.projectLabel)}</p>
        </td></tr>
        <tr><td style="padding:20px 36px 8px;">
          <p style="margin:0 0 12px;font-size:15px;color:#1a1a2e;">Hej ${escapeHtml(params.recipientName || "")},</p>
          <div style="font-size:14px;color:#1a1a2e;line-height:1.6;white-space:pre-line;">${escapeHtml(params.message)}</div>
        </td></tr>
        <tr><td style="padding:24px 36px 28px;">
          <p style="margin:0;font-size:12px;color:#7a7a8b;line-height:1.5;">Svara direkt på detta mejl – ditt svar kopplas automatiskt till rätt ärende hos ${escapeHtml(params.senderName)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const linkId: string | undefined = body.project_supplier_link_id;
    const customSubject: string | null = body.subject ?? null;
    const message: string | null = body.message ?? null;

    if (!linkId) throw new Error("project_supplier_link_id krävs");
    if (!message || !message.trim()) throw new Error("message krävs");

    const { data: link, error: linkError } = await supabase
      .from("project_supplier_links")
      .select("id, project_id, supplier_id, contact_id, organization_id, service_type")
      .eq("id", linkId)
      .maybeSingle();

    if (linkError) throw new Error(linkError.message);
    if (!link) throw new Error("Leverantörskopplingen hittades inte");

    // Organisationen härleds serverside – aldrig från klienten.
    const organizationId: string | null = link.organization_id ?? null;
    const sender = await resolveSender(supabase, organizationId, "planning");

    const { data: project } = await supabase
      .from("projects")
      .select("id, name, booking_id, organization_id")
      .eq("id", link.project_id)
      .maybeSingle();

    if (project?.organization_id && project.organization_id !== organizationId) {
      throw new Error("Projektet tillhör en annan organisation – utskicket stoppades");
    }

    // Mottagare: kontaktperson i första hand, annars leverantörens huvudmejl.
    let recipientEmail: string | null = null;
    let recipientName: string | null = null;

    if (link.contact_id) {
      const { data: contact } = await supabase
        .from("external_supplier_contacts")
        .select("name, email, organization_id")
        .eq("id", link.contact_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (contact?.email) {
        recipientEmail = contact.email;
        recipientName = contact.name ?? null;
      }
    }

    if (!recipientEmail) {
      const { data: supplier } = await supabase
        .from("external_suppliers")
        .select("name, email, organization_id")
        .eq("id", link.supplier_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (supplier?.email) {
        recipientEmail = supplier.email;
        recipientName = recipientName ?? supplier.name ?? null;
      }
    }

    if (!recipientEmail) throw new Error("Leverantören saknar mejladress");

    const subject = customSubject?.trim() ||
      `Förfrågan${project?.booking_id ? ` – ${project.booking_id}` : ""}: ${link.service_type || project?.name || "Projekt"}`;

    // Skapa tråden först – dess token är Reply-To-nyckeln.
    const { data: thread, error: threadError } = await supabase
      .from("supplier_request_threads")
      .insert({
        project_id: link.project_id,
        booking_id: project?.booking_id ?? null,
        project_supplier_link_id: link.id,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        subject,
        body: message,
        status: "sending",
        organization_id: organizationId,
      })
      .select("id, response_token")
      .single();

    if (threadError) throw new Error(`Kunde inte skapa förfrågan: ${threadError.message}`);

    const replyTo = buildReplyTo(sender, thread.response_token);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY saknas");
    const resend = new Resend(resendKey);

    const { data: sent, error: emailError } = await resend.emails.send({
      from: sender.from,
      to: [recipientEmail],
      reply_to: replyTo,
      subject,
      html: buildHtml({
        senderName: sender.displayName,
        recipientName,
        projectLabel: project?.name || "Projekt",
        bookingNumber: project?.booking_id ?? null,
        message,
      }),
    });

    if (emailError) {
      await supabase
        .from("supplier_request_threads")
        .update({ status: "failed" })
        .eq("id", thread.id);
      throw new Error(`Kunde inte skicka mejl: ${JSON.stringify(emailError)}`);
    }

    await supabase
      .from("supplier_request_threads")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: (sent as any)?.id ?? null,
      })
      .eq("id", thread.id);

    return new Response(
      JSON.stringify({ success: true, thread_id: thread.id, sent_to: recipientEmail, from: sender.from, reply_to: replyTo }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    const status = error instanceof SenderNotConfiguredError ? 422 : 400;
    console.error("[send-supplier-request]", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
