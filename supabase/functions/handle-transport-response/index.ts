import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const APP_URL = "https://kalender-vyer-mix.lovable.app";
const LOGO_URL = "https://pihrhltinhewhoxefjxv.supabase.co/storage/v1/object/public/email-assets/fransaugust-logo.png";

function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    const date = new Date(d);
    return date.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function redirect(status: string): Response {
  const url = `${APP_URL}/transport-svar?status=${encodeURIComponent(status)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

function buildConfirmationEmail(params: {
  action: "accepted" | "declined";
  partnerName: string;
  clientName: string;
  transportDate: string;
  bookingNumber: string | null;
  deliveryAddress: string | null;
  transportTime: string | null;
}): string {
  const isAccepted = params.action === "accepted";
  const title = isAccepted ? "Körning bokad!" : "Körning nekad";
  const titleColor = isAccepted ? "#279B9E" : "#dc2626";
  const message = isAccepted
    ? `Tack ${params.partnerName}! Ni har accepterat transporten för ${params.clientName} den ${formatDate(params.transportDate)}. Vi återkommer med ytterligare detaljer vid behov.`
    : `Tack för ert svar ${params.partnerName}. Körningen för ${params.clientName} den ${formatDate(params.transportDate)} har registrerats som nekad.`;

  const detailsHtml = isAccepted ? `
          <tr>
            <td style="padding:16px 40px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fafa;border-radius:12px;border:1px solid #e0ecee;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Datum</td><td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:600;">${formatDate(params.transportDate)}</td></tr>
                      ${params.transportTime ? `<tr><td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Tid</td><td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:600;">${params.transportTime}</td></tr>` : ''}
                      ${params.deliveryAddress ? `<tr><td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Leveransadress</td><td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:600;">${params.deliveryAddress}</td></tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : '';

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f0f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:16px 40px;border-bottom:1px solid #e0ecee;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;width:50%;">
                    <img src="${LOGO_URL}" alt="Frans August" width="150" style="max-width:150px;height:auto;display:block;border:0;font-size:20px;font-weight:bold;color:#1a3a3c;" />
                  </td>
                  <td style="vertical-align:middle;text-align:right;width:50%;">
                    ${params.bookingNumber ? `<p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a8b8d;font-weight:600;">Referensnummer</p>
                    <p style="margin:2px 0 0;font-size:16px;color:#1a3a3c;font-weight:700;">${params.bookingNumber}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 8px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:${titleColor};letter-spacing:-0.5px;">${title}</h1>
              <p style="margin:12px 0 0;font-size:15px;color:#1a3a3c;line-height:1.7;">${message}</p>
            </td>
          </tr>
          ${detailsHtml}
          <tr>
            <td style="padding:24px 40px;background-color:#f7fafa;border-top:1px solid #e0ecee;">
              <p style="margin:0;font-size:12px;color:#7a8b8d;text-align:center;line-height:1.5;">
                Detta mejl skickades automatiskt fr&aring;n Frans August Logistik.<br>
                Svara inte p&aring; detta mejl.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildBatchConfirmationEmail(params: {
  results: { action: "accepted" | "declined"; transportDate: string }[];
  partnerName: string;
  clientName: string;
  bookingNumber: string | null;
}): string {
  const allAccepted = params.results.every(r => r.action === "accepted");
  const allDeclined = params.results.every(r => r.action === "declined");
  const accepted = params.results.filter(r => r.action === "accepted").length;
  const declined = params.results.filter(r => r.action === "declined").length;

  let title: string;
  let titleColor: string;
  let message: string;

  if (allAccepted) {
    title = `${params.results.length} körningar bokade!`;
    titleColor = "#279B9E";
    message = `Tack ${params.partnerName}! Ni har accepterat ${params.results.length} körningar för ${params.clientName}. Vi återkommer med ytterligare detaljer vid behov.`;
  } else if (allDeclined) {
    title = `${params.results.length} körningar nekade`;
    titleColor = "#dc2626";
    message = `Tack för ert svar ${params.partnerName}. ${params.results.length} körningar för ${params.clientName} har registrerats som nekade.`;
  } else {
    title = "Svar registrerat";
    titleColor = "#279B9E";
    message = `Tack ${params.partnerName}! ${accepted} körning(ar) accepterade och ${declined} nekade för ${params.clientName}.`;
  }

  const detailsRows = params.results.map(r => {
    const icon = r.action === "accepted" ? "✅" : "❌";
    const label = r.action === "accepted" ? "Accepterad" : "Nekad";
    return `<tr><td style="padding:6px 12px;font-size:13px;color:#1a3a3c;border-bottom:1px solid #e0ecee;">${icon} <strong>${formatDate(r.transportDate)}</strong> &mdash; ${label}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f0f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:16px 40px;border-bottom:1px solid #e0ecee;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;width:50%;">
                    <img src="${LOGO_URL}" alt="Frans August" width="150" style="max-width:150px;height:auto;display:block;border:0;font-size:20px;font-weight:bold;color:#1a3a3c;" />
                  </td>
                  <td style="vertical-align:middle;text-align:right;width:50%;">
                    ${params.bookingNumber ? `<p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a8b8d;font-weight:600;">Referensnummer</p>
                    <p style="margin:2px 0 0;font-size:16px;color:#1a3a3c;font-weight:700;">${params.bookingNumber}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 8px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:${titleColor};letter-spacing:-0.5px;">${title}</h1>
              <p style="margin:12px 0 0;font-size:15px;color:#1a3a3c;line-height:1.7;">${message}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fafa;border-radius:12px;border:1px solid #e0ecee;">
                ${detailsRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background-color:#f7fafa;border-top:1px solid #e0ecee;">
              <p style="margin:0;font-size:12px;color:#7a8b8d;text-align:center;line-height:1.5;">
                Detta mejl skickades automatiskt fr&aring;n Frans August Logistik.<br>
                Svara inte p&aring; detta mejl.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }

  if (req.method !== "GET") {
    return redirect("error");
  }

  try {
    const url = new URL(req.url);
    const singleToken = url.searchParams.get("token");
    const multiTokens = url.searchParams.get("tokens");
    const action = url.searchParams.get("action");

    const tokens: string[] = [];
    if (multiTokens) {
      tokens.push(...multiTokens.split(",").map(t => t.trim()).filter(Boolean));
    } else if (singleToken) {
      tokens.push(singleToken);
    }

    console.log(`[handle-transport-response] Tokens: ${tokens.join(', ')}, Action: ${action}`);

    if (tokens.length === 0 || !action) {
      return redirect("error");
    }

    if (action !== "accepted" && action !== "declined") {
      return redirect("error");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve organization_id for multi-tenant
    const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
    const organizationId = orgData?.id;

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[handle-transport-response] RESEND_API_KEY not configured");
    }
    const resend = resendKey ? new Resend(resendKey) : null;

    interface ProcessedResult {
      action: "accepted" | "declined";
      partnerName: string;
      partnerEmail: string | null;
      clientName: string;
      transportDate: string;
      transportTime: string | null;
      deliveryAddress: string | null;
      bookingNumber: string | null;
      assignmentId: string;
      bookingId: string;
    }

    const results: ProcessedResult[] = [];
    let alreadyResponded = 0;

    for (const token of tokens) {
      const { data: assignment, error: fetchError } = await supabase
        .from("transport_assignments")
        .select(`
          id, partner_response, transport_date, transport_time, booking_id,
          booking:bookings!booking_id (client, booking_number, deliveryaddress),
          vehicle:vehicles!vehicle_id (name, contact_person, contact_email)
        `)
        .eq("partner_response_token", token)
        .single();

      if (fetchError || !assignment) {
        console.error(`[handle-transport-response] Assignment not found for token: ${token}`, fetchError?.message);
        continue;
      }

      if (assignment.partner_response === "accepted" || assignment.partner_response === "declined") {
        alreadyResponded++;
        console.log(`[handle-transport-response] Assignment ${assignment.id} already responded: ${assignment.partner_response}`);
        continue;
      }

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

      console.log(`[handle-transport-response] Assignment ${assignment.id} marked as ${action}`);

      results.push({
        action,
        partnerName: (assignment.vehicle as any)?.contact_person || (assignment.vehicle as any)?.name || "Partner",
        partnerEmail: (assignment.vehicle as any)?.contact_email || null,
        clientName: (assignment.booking as any)?.client || "Kund",
        transportDate: assignment.transport_date,
        transportTime: assignment.transport_time,
        deliveryAddress: (assignment.booking as any)?.deliveryaddress || null,
        bookingNumber: (assignment.booking as any)?.booking_number || null,
        assignmentId: assignment.id,
        bookingId: assignment.booking_id,
      });
    }

    // If all were already responded
    if (results.length === 0) {
      if (alreadyResponded > 0) {
        return redirect("already");
      }
      return redirect("error");
    }

    // Send confirmation email (fire and forget - don't let email failure affect the redirect)
    const partnerEmail = results[0].partnerEmail;
    if (resend && partnerEmail) {
      try {
        let emailHtml: string;
        let subject: string;

        if (results.length === 1) {
          const r = results[0];
          emailHtml = buildConfirmationEmail({
            action: r.action,
            partnerName: r.partnerName,
            clientName: r.clientName,
            transportDate: r.transportDate,
            bookingNumber: r.bookingNumber,
            deliveryAddress: r.deliveryAddress,
            transportTime: r.transportTime,
          });
          subject = r.action === "accepted"
            ? `Bekräftelse: Körning bokad ${formatDate(r.transportDate)}`
            : `Bekräftelse: Körning nekad ${formatDate(r.transportDate)}`;
        } else {
          emailHtml = buildBatchConfirmationEmail({
            results: results.map(r => ({ action: r.action, transportDate: r.transportDate })),
            partnerName: results[0].partnerName,
            clientName: results[0].clientName,
            bookingNumber: results[0].bookingNumber,
          });
          const allAccepted = results.every(r => r.action === "accepted");
          const allDeclined = results.every(r => r.action === "declined");
          subject = allAccepted
            ? `Bekräftelse: ${results.length} körningar bokade`
            : allDeclined
            ? `Bekräftelse: ${results.length} körningar nekade`
            : `Bekräftelse: Svar registrerat för ${results.length} körningar`;
        }

        const { error: emailError } = await resend.emails.send({
          from: "Frans August Logistik <noreply@fransaugust.se>",
          to: [partnerEmail],
          subject,
          html: emailHtml,
        });

        if (emailError) {
          console.error("[handle-transport-response] Failed to send confirmation email:", emailError);
        } else {
          console.log(`[handle-transport-response] Confirmation email sent to ${partnerEmail}`);

          // Log the email
          for (const r of results) {
            await supabase.from("transport_email_log").insert({
              assignment_id: r.assignmentId,
              booking_id: r.bookingId,
              recipient_email: partnerEmail,
              recipient_name: r.partnerName,
              subject,
              email_type: "transport_confirmation",
              sent_by: "system",
              organization_id: organizationId,
            });
          }
        }
      } catch (emailErr: any) {
        console.error("[handle-transport-response] Email send error:", emailErr.message);
      }
    } else {
      console.warn(`[handle-transport-response] No email sent - resend: ${!!resend}, partnerEmail: ${partnerEmail}`);
    }

    // Redirect to the app's thank-you page
    return redirect(action);
  } catch (error: any) {
    console.error("[handle-transport-response] Error:", error.message);
    return redirect("error");
  }
});
