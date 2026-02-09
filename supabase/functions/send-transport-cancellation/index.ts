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

function buildCancellationEmailHtml(params: {
  clientName: string;
  bookingNumber: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryPostalCode: string | null;
  contactName: string | null;
  contactPhone: string | null;
  pickupAddress: string | null;
  vehicleType: string | null;
  transportDate: string;
  transportTime: string | null;
  partnerName: string;
  customMessage: string | null;
}): string {
  const vt = params.vehicleType ? (vehicleTypeLabels[params.vehicleType] || params.vehicleType) : "—";
  const deliveryFull = [params.deliveryAddress, params.deliveryPostalCode, params.deliveryCity]
    .filter(Boolean)
    .join(", ");

  const customMessageHtml = params.customMessage ? `
              <div style="margin:16px 0 0;padding:16px 20px;background-color:#fef3c7;border-radius:8px;border:1px solid #fde68a;">
                <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:700;">Meddelande</p>
                <p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.6;white-space:pre-line;">${params.customMessage}</p>
              </div>` : '';

  return `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transport avbokad</title>
</head>
<body style="margin:0;padding:0;background-color:#fdf2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fdf2f2;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Logo + Reference bar -->
          <tr>
            <td style="padding:16px 40px;border-bottom:1px solid #fecaca;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;width:50%;">
                    <img src="https://pihrhltinhewhoxefjxv.supabase.co/storage/v1/object/public/email-assets/fransaugust-logo.png" alt="Frans August" width="150" height="36" style="height:36px;width:150px;display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;text-align:right;width:50%;">
                    ${params.bookingNumber ? `<p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a7a7a;font-weight:600;">Referensnummer</p>
                    <p style="margin:2px 0 0;font-size:16px;color:#1a1a1a;font-weight:700;">${params.bookingNumber}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background-color:#ea580c;background:linear-gradient(135deg,#c2410c,#ea580c);padding:16px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Transport avbokad</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Denna transport har avbokats av Frans August Logistik</p>
            </td>
          </tr>

          <!-- Partner greeting + custom message -->
          <tr>
            <td style="padding:12px 40px 0;">
              <p style="margin:0;font-size:15px;color:#1a1a1a;font-weight:600;">Hej ${params.partnerName},</p>
              <p style="margin:6px 0 0;font-size:14px;color:#5a5a5a;line-height:1.6;">
                Vi vill informera om att nedanstående transport har avbokats. Om ni fått en tidigare förfrågan för denna transport kan ni bortse från den.
              </p>
              ${customMessageHtml}
            </td>
          </tr>

          <!-- Booking details card -->
          <tr>
            <td style="padding:24px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fef2f2;border-radius:12px;border:1px solid #fecaca;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#dc2626;font-weight:700;">Avbokad transport</p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a7a7a;width:140px;">Kund</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:600;">${params.clientName}${params.bookingNumber ? ` (#${params.bookingNumber})` : ''}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a7a7a;">Leveransadress</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:500;">${deliveryFull || '—'}</td>
                      </tr>
                      ${params.contactName ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a7a7a;">Kontaktperson</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:500;">${params.contactName}${params.contactPhone ? ` · ${params.contactPhone}` : ''}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a7a7a;">Upphämtning</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:500;">${params.pickupAddress || '—'}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a7a7a;">Fordonstyp</td>
                        <td style="padding:6px 0;font-size:13px;color:#1a1a1a;font-weight:600;">${vt}</td>
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fef2f2;border-radius:12px;border:1px solid #fecaca;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#dc2626;font-weight:700;">Tider</p>
                    
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a7a7a;width:140px;">Transportdatum</td>
                        <td style="padding:6px 0;font-size:14px;color:#1a1a1a;font-weight:700;">${formatDate(params.transportDate)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a7a7a;">Tid</td>
                        <td style="padding:6px 0;font-size:14px;color:#1a1a1a;font-weight:700;">${params.transportTime || '—'}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Info box - no action needed -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="padding:16px 20px;background-color:#fff7ed;border-radius:12px;border:1px solid #fed7aa;text-align:center;">
                <p style="margin:0;font-size:14px;color:#9a3412;font-weight:600;">
                  Ingen åtgärd krävs
                </p>
                <p style="margin:8px 0 0;font-size:13px;color:#c2410c;line-height:1.5;">
                  Denna transport är avbokad. Eventuella tidigare förfrågningar för denna körning kan ignoreras.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#fef2f2;border-top:1px solid #fecaca;">
              <p style="margin:0;font-size:12px;color:#7a7a7a;text-align:center;line-height:1.5;">
                Detta mejl skickades automatiskt från Frans August Logistik.<br>
                Svara inte på detta mejl.
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

    const { assignment_id, custom_message } = await req.json();
    if (!assignment_id) throw new Error("assignment_id is required");

    console.log(`[send-transport-cancellation] Processing assignment: ${assignment_id}`);

    // Fetch the transport assignment with booking and vehicle data
    const { data: assignment, error: assignmentError } = await supabase
      .from("transport_assignments")
      .select(`
        *,
        booking:bookings!booking_id (
          id, client, booking_number,
          deliveryaddress, delivery_city, delivery_postal_code,
          contact_name, contact_phone, contact_email
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
      console.log(`[send-transport-cancellation] Partner ${vehicle?.name || 'unknown'} has no email — skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_email" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determine vehicle type
    const vehicleType = assignment.vehicle_type ||
      (vehicle.provided_vehicle_types && vehicle.provided_vehicle_types.length > 0
        ? vehicle.provided_vehicle_types[0]
        : vehicle.vehicle_type);

    const html = buildCancellationEmailHtml({
      clientName: booking?.client || "—",
      bookingNumber: booking?.booking_number || null,
      deliveryAddress: booking?.deliveryaddress || null,
      deliveryCity: booking?.delivery_city || null,
      deliveryPostalCode: booking?.delivery_postal_code || null,
      contactName: booking?.contact_name || null,
      contactPhone: booking?.contact_phone || null,
      pickupAddress: assignment.pickup_address || null,
      vehicleType: vehicleType,
      transportDate: assignment.transport_date,
      transportTime: assignment.transport_time || null,
      partnerName: vehicle.contact_person || vehicle.name,
      customMessage: custom_message || null,
    });

    const emailSubject = `Transport avbokad: ${booking?.client || 'Bokning'} — ${formatDate(assignment.transport_date)}`;

    console.log(`[send-transport-cancellation] Sending cancellation email to: ${vehicle.contact_email}`);

    const { error: emailError } = await resend.emails.send({
      from: "Frans August Logistik <noreply@fransaugust.se>",
      to: [vehicle.contact_email],
      subject: emailSubject,
      html,
    });

    if (emailError) {
      console.error("[send-transport-cancellation] Email error:", emailError);
      throw new Error(`Failed to send email: ${JSON.stringify(emailError)}`);
    }

    // Log the email in transport_email_log
    const { error: logError } = await supabase
      .from("transport_email_log")
      .insert({
        assignment_id: assignment_id,
        booking_id: booking?.id || assignment.booking_id,
        recipient_email: vehicle.contact_email,
        recipient_name: vehicle.contact_person || vehicle.name,
        subject: emailSubject,
        custom_message: custom_message || null,
        email_type: "transport_cancellation",
      });

    if (logError) {
      console.warn("[send-transport-cancellation] Failed to log email:", logError.message);
    }

    console.log(`[send-transport-cancellation] Cancellation email sent and logged successfully to ${vehicle.contact_email}`);

    return new Response(
      JSON.stringify({ success: true, sent_to: vehicle.contact_email }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[send-transport-cancellation] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
