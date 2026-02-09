import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

function buildResponsePage(results: { action: "accepted" | "declined"; partnerName: string; clientName: string; transportDate: string }[]): string {
  const isBatch = results.length > 1;
  const isAllAccepted = results.every(r => r.action === "accepted");
  const isAllDeclined = results.every(r => r.action === "declined");

  let title: string;
  let emoji: string;
  let bgColor: string;
  let message: string;

  if (isBatch) {
    if (isAllAccepted) {
      title = "Körningar accepterade!";
      emoji = "✅";
      bgColor = "#279B9E";
      message = `Tack ${results[0].partnerName}! Ni har accepterat ${results.length} körningar för ${results[0].clientName}. Vi återkommer med ytterligare detaljer vid behov.`;
    } else if (isAllDeclined) {
      title = "Körningar nekade";
      emoji = "❌";
      bgColor = "#dc3545";
      message = `Tack för ert svar ${results[0].partnerName}. ${results.length} körningar för ${results[0].clientName} har markerats som nekade. Vi söker annan lösning.`;
    } else {
      title = "Svar registrerat";
      emoji = "📝";
      bgColor = "#279B9E";
      const accepted = results.filter(r => r.action === "accepted").length;
      const declined = results.filter(r => r.action === "declined").length;
      message = `Tack ${results[0].partnerName}! ${accepted} körning(ar) accepterade och ${declined} nekade för ${results[0].clientName}.`;
    }
  } else {
    const r = results[0];
    const isAccepted = r.action === "accepted";
    emoji = isAccepted ? "✅" : "❌";
    title = isAccepted ? "Körning accepterad!" : "Körning nekad";
    bgColor = isAccepted ? "#279B9E" : "#dc3545";
    message = isAccepted
      ? `Tack ${r.partnerName}! Ni har accepterat transportförfrågan för ${r.clientName} den ${r.transportDate}. Vi återkommer med ytterligare detaljer vid behov.`
      : `Tack för ert svar ${r.partnerName}. Körningen för ${r.clientName} den ${r.transportDate} har markerats som nekad. Vi söker annan lösning.`;
  }

  // Build details list for batch
  const detailsHtml = isBatch ? `
    <div style="margin:24px 0 0;text-align:left;">
      ${results.map(r => {
        const icon = r.action === "accepted" ? "✅" : "❌";
        const label = r.action === "accepted" ? "Accepterad" : "Nekad";
        return `<div style="padding:10px 16px;margin:6px 0;background:#f7fafa;border-radius:8px;border:1px solid #e0ecee;display:flex;align-items:center;">
          <span style="font-size:16px;margin-right:10px;">${icon}</span>
          <span style="font-size:14px;color:#1a3a3c;"><strong>${r.transportDate}</strong> — ${label}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:#ffffff;border-radius:20px;padding:48px;max-width:520px;margin:32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.1);">
    <div style="width:80px;height:80px;border-radius:50%;background:${bgColor};display:inline-flex;align-items:center;justify-content:center;margin-bottom:24px;">
      <span style="font-size:36px;">${emoji}</span>
    </div>
    <h1 style="margin:0 0 16px;font-size:28px;color:#1a3a3c;font-weight:700;letter-spacing:-0.5px;">${title}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#5a6b6d;line-height:1.7;">${message}</p>
    ${detailsHtml}
    <div style="padding:16px 24px;background:#f7fafa;border-radius:12px;border:1px solid #e0ecee;margin-top:24px;">
      <p style="margin:0;font-size:12px;color:#7a8b8d;">Du kan stänga detta fönster. Svaret har registrerats i systemet.</p>
    </div>
  </div>
</body>
</html>`;
}

function buildErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fel</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:#ffffff;border-radius:20px;padding:48px;max-width:480px;margin:32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.1);">
    <div style="width:80px;height:80px;border-radius:50%;background:#f59e0b;display:inline-flex;align-items:center;justify-content:center;margin-bottom:24px;">
      <span style="font-size:36px;">⚠️</span>
    </div>
    <h1 style="margin:0 0 16px;font-size:24px;color:#1a3a3c;font-weight:700;">Något gick fel</h1>
    <p style="margin:0;font-size:15px;color:#5a6b6d;line-height:1.7;">${message}</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return htmlResponse("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const singleToken = url.searchParams.get("token");
    const multiTokens = url.searchParams.get("tokens");
    const action = url.searchParams.get("action");

    // Support both single token and comma-separated tokens
    const tokens: string[] = [];
    if (multiTokens) {
      tokens.push(...multiTokens.split(",").map(t => t.trim()).filter(Boolean));
    } else if (singleToken) {
      tokens.push(singleToken);
    }

    console.log(`[handle-transport-response] Tokens: ${tokens.join(', ')}, Action: ${action}`);

    if (tokens.length === 0 || !action) {
      return htmlResponse(buildErrorPage("Ogiltig länk. Token eller åtgärd saknas."), 400);
    }

    if (action !== "accepted" && action !== "declined") {
      return htmlResponse(buildErrorPage("Ogiltig åtgärd. Använd länkarna i mejlet."), 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results: { action: "accepted" | "declined"; partnerName: string; clientName: string; transportDate: string }[] = [];
    let alreadyResponded = 0;

    for (const token of tokens) {
      // Find the assignment by token
      const { data: assignment, error: fetchError } = await supabase
        .from("transport_assignments")
        .select(`
          id, partner_response, transport_date,
          booking:bookings!booking_id (client),
          vehicle:vehicles!vehicle_id (name, contact_person)
        `)
        .eq("partner_response_token", token)
        .single();

      if (fetchError || !assignment) {
        console.error(`[handle-transport-response] Assignment not found for token: ${token}`, fetchError?.message);
        continue;
      }

      // Check if already responded
      if (assignment.partner_response === "accepted" || assignment.partner_response === "declined") {
        alreadyResponded++;
        console.log(`[handle-transport-response] Assignment ${assignment.id} already responded: ${assignment.partner_response}`);
        continue;
      }

      // Update the assignment
      const { error: updateError } = await supabase
        .from("transport_assignments")
        .update({
          partner_response: action,
          partner_responded_at: new Date().toISOString(),
        })
        .eq("id", assignment.id);

      if (updateError) {
        console.error(`[handle-transport-response] Update error for ${assignment.id}:`, updateError.message);
        continue;
      }

      const partnerName = (assignment.vehicle as any)?.contact_person || (assignment.vehicle as any)?.name || "Partner";
      const clientName = (assignment.booking as any)?.client || "Kund";

      console.log(`[handle-transport-response] Assignment ${assignment.id} marked as ${action}`);

      results.push({
        action,
        partnerName,
        clientName,
        transportDate: assignment.transport_date,
      });
    }

    // If all were already responded
    if (results.length === 0) {
      if (alreadyResponded > 0) {
        return htmlResponse(
          buildErrorPage(`${alreadyResponded > 1 ? 'Dessa förfrågningar' : 'Denna förfrågan'} har redan besvarats. Kontakta oss om ni vill ändra ert svar.`)
        );
      }
      return htmlResponse(buildErrorPage("Transportförfrågan hittades inte. Länken kan ha upphört att gälla."), 404);
    }

    return htmlResponse(buildResponsePage(results));
  } catch (error: any) {
    console.error("[handle-transport-response] Error:", error.message);
    return htmlResponse(buildErrorPage("Ett oväntat fel uppstod. Försök igen senare."), 500);
  }
});
