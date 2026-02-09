import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const vehicleTypeLabels: Record<string, string> = {
  van: "Skåpbil",
  light_truck: "Lätt lastbil",
  pickup_crane: "C-pickis med kran",
  crane_15m: "Kranbil 15m kran",
  crane_jib_20m: "Kranbil m jibb 20m",
  body_truck: "Bodbil",
  truck: "Lastbil",
  trailer: "Släp",
  trailer_13m: "Trailer (13m)",
  truck_trailer: "Lastbil med släp",
  crane_trailer: "Kranbil med släp",
  other: "Övrigt",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    return date.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function buildEmailHtml(params: {
  clientName: string;
  bookingNumber: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryPostalCode: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  pickupAddress: string | null;
  vehicleType: string | null;
  transportDate: string;
  transportTime: string | null;
  rigDate: string | null;
  eventDate: string | null;
  rigdownDate: string | null;
  partnerName: string;
  acceptUrl: string;
  declineUrl: string;
  customMessage: string | null;
}): string {
  const vt = params.vehicleType ? (vehicleTypeLabels[params.vehicleType] || params.vehicleType) : "—";
  const deliveryFull = [params.deliveryAddress, params.deliveryPostalCode, params.deliveryCity]
    .filter(Boolean)
    .join(", ");

  const customMessageHtml = params.customMessage ? `
              <div style="margin:16px 0 0;padding:16px 20px;background-color:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
                <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:700;">Meddelande</p>
                <p style="margin:0;font-size:14px;color:#1a3a3c;line-height:1.6;white-space:pre-line;">${params.customMessage}</p>
              </div>` : '';

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transportförfrågan</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f0f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a6b6e,#279B9E);padding:32px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Transportförfrågan</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Ny körning att granska från Frans August Logistik</p>
            </td>
          </tr>

          <!-- Partner greeting + custom message -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0;font-size:16px;color:#1a3a3c;font-weight:600;">Hej ${params.partnerName},</p>
              <p style="margin:12px 0 0;font-size:14px;color:#5a6b6d;line-height:1.6;">
                Vi har en ny transportförfrågan som vi gärna vill att ni utför. Se detaljer nedan och svara genom att klicka på knapparna.
              </p>
              ${customMessageHtml}
            </td>
          </tr>

          <!-- Booking details card -->
          <tr>
            <td style="padding:24px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7fafa;border-radius:12px;border:1px solid #e0ecee;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#279B9E;font-weight:700;">Bokningsdetaljer</p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;width:140px;">Kund</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;font-weight:600;">${params.clientName}${params.bookingNumber ? ` (#${params.bookingNumber})` : ''}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Leveransadress</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;font-weight:500;">${deliveryFull || '—'}</td>
                      </tr>
                      ${params.contactName ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Kontaktperson</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;font-weight:500;">${params.contactName}${params.contactPhone ? ` · ${params.contactPhone}` : ''}${params.contactEmail ? ` · ${params.contactEmail}` : ''}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Upphämtning</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;font-weight:500;">${params.pickupAddress || '—'}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Fordonstyp</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;font-weight:600;">${vt}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Schedule card -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7fafa;border-radius:12px;border:1px solid #e0ecee;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#279B9E;font-weight:700;">Tider</p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;width:140px;">Transportdatum</td>
                        <td style="padding:6px 0;font-size:14px;color:#1a3a3c;font-weight:700;">${formatDate(params.transportDate)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Tid</td>
                        <td style="padding:6px 0;font-size:14px;color:#1a3a3c;font-weight:700;">${params.transportTime || '—'}</td>
                      </tr>
                      ${params.rigDate ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Riggdag</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;">${formatDate(params.rigDate)}</td>
                      </tr>` : ''}
                      ${params.eventDate ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Eventdag</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;">${formatDate(params.eventDate)}</td>
                      </tr>` : ''}
                      ${params.rigdownDate ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Nedrigg</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;">${formatDate(params.rigdownDate)}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action buttons - stacked vertically for better email client compatibility -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 16px;font-size:14px;color:#5a6b6d;text-align:center;">Vänligen svara på denna förfrågan:</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:0 0 12px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${params.acceptUrl}" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="25%" strokecolor="#1a6b6e" fillcolor="#1a6b6e">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">Acceptera körning</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${params.acceptUrl}" 
                       style="display:block;width:100%;max-width:340px;padding:14px 32px;background-color:#1a6b6e;color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.3px;text-align:center;mso-padding-alt:14px 32px;box-sizing:border-box;">
                      Acceptera körning
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${params.declineUrl}" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="25%" strokecolor="#dc3545" fillcolor="#dc3545">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">Neka körning</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${params.declineUrl}" 
                       style="display:block;width:100%;max-width:340px;padding:14px 32px;background-color:#dc3545;color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.3px;text-align:center;mso-padding-alt:14px 32px;box-sizing:border-box;">
                      Neka körning
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#f7fafa;border-top:1px solid #e0ecee;">
              <p style="margin:0;font-size:12px;color:#7a8b8d;text-align:center;line-height:1.5;">
                Detta mejl skickades automatiskt från Frans August Logistik.<br>
                Svara inte på detta mejl — använd knapparna ovan.
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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const resend = new Resend(resendKey);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { assignment_id, custom_subject, custom_message } = await req.json();
    if (!assignment_id) throw new Error("assignment_id is required");

    console.log(`[send-transport-request] Processing assignment: ${assignment_id}`);

    // Fetch the transport assignment with booking and vehicle data
    const { data: assignment, error: assignmentError } = await supabase
      .from("transport_assignments")
      .select(`
        *,
        booking:bookings!booking_id (
          id, client, booking_number,
          deliveryaddress, delivery_city, delivery_postal_code,
          contact_name, contact_phone, contact_email,
          rigdaydate, eventdate, rigdowndate
        ),
        vehicle:vehicles!vehicle_id (
          id, name, contact_email, contact_person, contact_phone,
          vehicle_type, provided_vehicle_types
        )
      `)
      .eq("id", assignment_id)
      .single();

    if (assignmentError) throw new Error(`Assignment not found: ${assignmentError.message}`);
    if (!assignment) throw new Error("Assignment not found");

    const booking = assignment.booking;
    const vehicle = assignment.vehicle;

    if (!vehicle?.contact_email) {
      throw new Error(`Partner ${vehicle?.name || 'unknown'} har ingen mejladress konfigurerad`);
    }

    const token = assignment.partner_response_token;
    if (!token) throw new Error("No response token on assignment");

    // Build response URLs
    const responseBaseUrl = `${supabaseUrl}/functions/v1/handle-transport-response`;
    const acceptUrl = `${responseBaseUrl}?token=${token}&action=accepted`;
    const declineUrl = `${responseBaseUrl}?token=${token}&action=declined`;

    // Determine vehicle type shown
    const vehicleType = assignment.vehicle_type || 
      (vehicle.provided_vehicle_types && vehicle.provided_vehicle_types.length > 0 
        ? vehicle.provided_vehicle_types[0] 
        : vehicle.vehicle_type);

    const html = buildEmailHtml({
      clientName: booking?.client || "—",
      bookingNumber: booking?.booking_number || null,
      deliveryAddress: booking?.deliveryaddress || null,
      deliveryCity: booking?.delivery_city || null,
      deliveryPostalCode: booking?.delivery_postal_code || null,
      contactName: booking?.contact_name || null,
      contactPhone: booking?.contact_phone || null,
      contactEmail: booking?.contact_email || null,
      pickupAddress: assignment.pickup_address || null,
      vehicleType: vehicleType,
      transportDate: assignment.transport_date,
      transportTime: assignment.transport_time || null,
      rigDate: booking?.rigdaydate || null,
      eventDate: booking?.eventdate || null,
      rigdownDate: booking?.rigdowndate || null,
      partnerName: vehicle.contact_person || vehicle.name,
      acceptUrl,
      declineUrl,
      customMessage: custom_message || null,
    });

    const emailSubject = custom_subject || `Transportförfrågan: ${booking?.client || 'Bokning'} — ${formatDate(assignment.transport_date)}`;

    console.log(`[send-transport-request] Sending email to: ${vehicle.contact_email}, subject: ${emailSubject}`);

    const { error: emailError } = await resend.emails.send({
      from: "Frans August Logistik <noreply@fransaugust.se>",
      to: [vehicle.contact_email],
      subject: emailSubject,
      html,
    });

    if (emailError) {
      console.error("[send-transport-request] Email error:", emailError);
      throw new Error(`Failed to send email: ${JSON.stringify(emailError)}`);
    }

    // Update assignment status to pending
    await supabase
      .from("transport_assignments")
      .update({ partner_response: "pending" })
      .eq("id", assignment_id);

    // Log the email send to transport_email_log
    const { error: logError } = await supabase
      .from("transport_email_log")
      .insert({
        assignment_id: assignment_id,
        booking_id: booking?.id || assignment.booking_id,
        recipient_email: vehicle.contact_email,
        recipient_name: vehicle.contact_person || vehicle.name,
        subject: emailSubject,
        custom_message: custom_message || null,
        email_type: "transport_request",
      });

    if (logError) {
      console.warn("[send-transport-request] Failed to log email:", logError.message);
    }

    console.log(`[send-transport-request] Email sent and logged successfully to ${vehicle.contact_email}`);

    return new Response(
      JSON.stringify({ success: true, sent_to: vehicle.contact_email }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[send-transport-request] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
