import { createClient } from "npm:@supabase/supabase-js@2";

function buildResponsePage(action: "accepted" | "declined", partnerName: string, clientName: string, transportDate: string): string {
  const isAccepted = action === "accepted";
  const emoji = isAccepted ? "✅" : "❌";
  const title = isAccepted ? "Körning accepterad!" : "Körning nekad";
  const message = isAccepted
    ? `Tack ${partnerName}! Ni har accepterat transportförfrågan för ${clientName} den ${transportDate}. Vi återkommer med ytterligare detaljer vid behov.`
    : `Tack för ert svar ${partnerName}. Körningen för ${clientName} den ${transportDate} har markerats som nekad. Vi söker annan lösning.`;
  const bgColor = isAccepted ? "#279B9E" : "#dc3545";

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:#ffffff;border-radius:20px;padding:48px;max-width:480px;margin:32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.1);">
    <div style="width:80px;height:80px;border-radius:50%;background:${bgColor};display:inline-flex;align-items:center;justify-content:center;margin-bottom:24px;">
      <span style="font-size:36px;">${emoji}</span>
    </div>
    <h1 style="margin:0 0 16px;font-size:28px;color:#1a3a3c;font-weight:700;letter-spacing:-0.5px;">${title}</h1>
    <p style="margin:0 0 32px;font-size:15px;color:#5a6b6d;line-height:1.7;">${message}</p>
    <div style="padding:16px 24px;background:#f7fafa;border-radius:12px;border:1px solid #e0ecee;">
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
  // This is a GET endpoint - links from email
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const action = url.searchParams.get("action");

    console.log(`[handle-transport-response] Token: ${token}, Action: ${action}`);

    if (!token || !action) {
      return new Response(buildErrorPage("Ogiltig länk. Token eller åtgärd saknas."), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (action !== "accepted" && action !== "declined") {
      return new Response(buildErrorPage("Ogiltig åtgärd. Använd länkarna i mejlet."), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      console.error("[handle-transport-response] Assignment not found:", fetchError?.message);
      return new Response(buildErrorPage("Transportförfrågan hittades inte. Länken kan ha upphört att gälla."), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Check if already responded
    if (assignment.partner_response === "accepted" || assignment.partner_response === "declined") {
      const alreadyAction = assignment.partner_response === "accepted" ? "accepterat" : "nekat";
      return new Response(
        buildErrorPage(`Denna förfrågan har redan besvarats (${alreadyAction}). Kontakta oss om du vill ändra ditt svar.`),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
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
      console.error("[handle-transport-response] Update error:", updateError.message);
      return new Response(buildErrorPage("Kunde inte registrera ditt svar. Försök igen."), {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const partnerName = (assignment.vehicle as any)?.contact_person || (assignment.vehicle as any)?.name || "Partner";
    const clientName = (assignment.booking as any)?.client || "Kund";

    console.log(`[handle-transport-response] Assignment ${assignment.id} marked as ${action}`);

    return new Response(
      buildResponsePage(action, partnerName, clientName, assignment.transport_date),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error: any) {
    console.error("[handle-transport-response] Error:", error.message);
    return new Response(buildErrorPage("Ett oväntat fel uppstod. Försök igen senare."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});
