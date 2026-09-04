// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseReplyToken } from "../_shared/email/senderIdentity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

/** Plockar ut alla tänkbara mottagaradresser ur en inbound-payload. */
function collectRecipients(payload: any): string[] {
  const raw = [
    payload?.to,
    payload?.data?.to,
    payload?.envelope?.to,
    payload?.data?.envelope?.to,
    payload?.headers?.to,
  ];
  const out: string[] = [];
  for (const value of raw) {
    if (!value) continue;
    if (Array.isArray(value)) out.push(...value.map((v: any) => (typeof v === "string" ? v : v?.address ?? "")));
    else if (typeof value === "string") out.push(value);
    else if (typeof value === "object" && value.address) out.push(value.address);
  }
  return out.filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("SUPPLIER_REPLY_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[receive-supplier-reply] SUPPLIER_REPLY_WEBHOOK_SECRET saknas");
    return json({ error: "webhook_not_configured" }, 503);
  }
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await req.json();

    let parsed: { token: string; domain: string } | null = null;
    for (const address of collectRecipients(payload)) {
      parsed = parseReplyToken(address);
      if (parsed) break;
    }
    if (!parsed) return json({ error: "no_thread_token" }, 422);

    const { data: thread, error } = await supabase
      .from("supplier_request_threads")
      .select("id, organization_id, status")
      .eq("response_token", parsed.token)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!thread) return json({ error: "thread_not_found" }, 404);

    // Cross-org-skydd: svarsdomänen måste tillhöra trådens organisation.
    const { data: sender } = await supabase
      .from("organization_email_senders")
      .select("organization_id, reply_domain, mail_domain")
      .eq("organization_id", thread.organization_id)
      .maybeSingle();

    const allowedDomains = [sender?.reply_domain, sender?.mail_domain]
      .filter(Boolean)
      .map((d: string) => d.toLowerCase());

    if (!allowedDomains.includes(parsed.domain)) {
      console.warn("[receive-supplier-reply] domän matchar inte organisationen", parsed.domain);
      return json({ error: "organization_mismatch" }, 403);
    }

    const responseMessage: string =
      payload?.text ?? payload?.data?.text ?? payload?.html ?? payload?.data?.html ?? "";
    const responseName: string | null =
      payload?.from_name ?? payload?.data?.from?.name ?? payload?.from ?? payload?.data?.from ?? null;

    const { error: updateError } = await supabase
      .from("supplier_request_threads")
      .update({
        response_message: typeof responseMessage === "string" ? responseMessage.slice(0, 20000) : null,
        response_name: typeof responseName === "string" ? responseName.slice(0, 300) : null,
        responded_at: new Date().toISOString(),
        status: "responded",
      })
      .eq("id", thread.id);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ success: true, thread_id: thread.id });
  } catch (err: any) {
    console.error("[receive-supplier-reply]", err.message);
    return json({ error: err.message }, 400);
  }
});
