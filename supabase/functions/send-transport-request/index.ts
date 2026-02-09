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

interface AssignmentData {
  id: string;
  transport_date: string;
  transport_time: string | null;
  pickup_address: string | null;
  vehicle_type: string | null;
  token: string;
  acceptUrl: string;
  declineUrl: string;
}

interface EmailParams {
  clientName: string;
  bookingNumber: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryPostalCode: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  partnerName: string;
  rigDate: string | null;
  eventDate: string | null;
  rigdownDate: string | null;
  customMessage: string | null;
  referencePerson: string | null;
  assignments: AssignmentData[];
}

function buildSingleAssignmentCard(a: AssignmentData): string {
  const vt = a.vehicle_type ? (vehicleTypeLabels[a.vehicle_type] || a.vehicle_type) : "—";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7fafa;border-radius:12px;border:1px solid #e0ecee;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#279B9E;font-weight:700;">Körning — ${formatDate(a.transport_date)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding:4px 0;font-size:13px;color:#7a8b8d;width:110px;">Datum</td>
              <td style="padding:4px 0;font-size:14px;color:#1a3a3c;font-weight:700;">${formatDate(a.transport_date)}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Tid</td>
              <td style="padding:4px 0;font-size:14px;color:#1a3a3c;font-weight:700;">${a.transport_time || '—'}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Upphämtning</td>
              <td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:500;">${a.pickup_address || '—'}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Fordonstyp</td>
              <td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:600;">${vt}</td>
            </tr>
          </table>
          <!-- Individual buttons -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
            <tr>
              <td align="center" style="padding:0 0 8px;">
                <a href="${a.acceptUrl}" style="display:block;width:100%;padding:10px 16px;background-color:#1a6b6e;color:#ffffff;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700;text-align:center;box-sizing:border-box;">
                  ✓ Acceptera
                </a>
              </td>
            </tr>
            <tr>
              <td align="center">
                <a href="${a.declineUrl}" style="display:block;width:100%;padding:10px 16px;background-color:#dc3545;color:#ffffff;text-decoration:none;border-radius:10px;font-size:13px;font-weight:700;text-align:center;box-sizing:border-box;">
                  ✕ Neka
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function buildEmailHtml(params: EmailParams): string {
  const deliveryFull = [params.deliveryAddress, params.deliveryPostalCode, params.deliveryCity]
    .filter(Boolean)
    .join(", ");

  const customMessageHtml = params.customMessage ? `
              <div style="margin:16px 0 0;padding:16px 20px;background-color:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
                <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#92400e;font-weight:700;">Meddelande</p>
                <p style="margin:0;font-size:14px;color:#1a3a3c;line-height:1.6;white-space:pre-line;">${params.customMessage}</p>
              </div>` : '';

  const isMulti = params.assignments.length > 1;
  
  // Build assignment cards - side by side for multi, full width for single
  let assignmentCardsHtml: string;
  if (isMulti) {
    // Side by side layout using table columns
    const allTokens = params.assignments.map(a => a.token).join(",");
    const acceptAllUrl = params.assignments[0].acceptUrl.split("?")[0] + `?tokens=${allTokens}&action=accepted`;
    const declineAllUrl = params.assignments[0].acceptUrl.split("?")[0] + `?tokens=${allTokens}&action=declined`;

    assignmentCardsHtml = `
          <!-- Side by side assignment cards -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  ${params.assignments.map((a, i) => `
                  <td style="width:${Math.floor(100 / params.assignments.length)}%;vertical-align:top;${i > 0 ? 'padding-left:12px;' : ''}">
                    ${buildSingleAssignmentCard(a)}
                  </td>`).join('')}
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Accept all button -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:0 0 12px;">
                    <a href="${acceptAllUrl}" 
                       style="display:block;width:100%;max-width:400px;padding:14px 32px;background:linear-gradient(135deg,#1a6b6e,#279B9E);color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.3px;text-align:center;box-sizing:border-box;">
                      ✓ Acceptera båda körningarna
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="${declineAllUrl}" 
                       style="display:block;width:100%;max-width:400px;padding:12px 32px;background-color:transparent;color:#dc3545;text-decoration:none;border-radius:12px;font-size:13px;font-weight:600;text-align:center;border:1px solid #dc3545;box-sizing:border-box;">
                      Neka båda körningarna
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
  } else {
    // Single assignment - original full-width layout
    const a = params.assignments[0];
    const vt = a.vehicle_type ? (vehicleTypeLabels[a.vehicle_type] || a.vehicle_type) : "—";
    
    assignmentCardsHtml = `
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
                        <td style="padding:6px 0;font-size:13px;color:#1a3a3c;font-weight:500;">${a.pickup_address || '—'}</td>
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
                        <td style="padding:6px 0;font-size:14px;color:#1a3a3c;font-weight:700;">${formatDate(a.transport_date)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#7a8b8d;">Tid</td>
                        <td style="padding:6px 0;font-size:14px;color:#1a3a3c;font-weight:700;">${a.transport_time || '—'}</td>
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

          <!-- Action buttons -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 16px;font-size:14px;color:#5a6b6d;text-align:center;">Vänligen svara på denna förfrågan:</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:0 0 12px;">
                    <a href="${a.acceptUrl}" 
                       style="display:block;width:100%;max-width:340px;padding:14px 32px;background-color:#1a6b6e;color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.3px;text-align:center;box-sizing:border-box;">
                      Acceptera körning
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0;">
                    <a href="${a.declineUrl}" 
                       style="display:block;width:100%;max-width:340px;padding:14px 32px;background-color:#dc3545;color:#ffffff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:0.3px;text-align:center;box-sizing:border-box;">
                      Neka körning
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
  }

  // For multi-assignment, add shared booking info before the cards
  const sharedBookingInfoHtml = isMulti ? `
          <!-- Shared booking info -->
          <tr>
            <td style="padding:24px 40px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f7fafa;border-radius:12px;border:1px solid #e0ecee;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#279B9E;font-weight:700;">Bokningsdetaljer</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:#7a8b8d;width:140px;">Kund</td>
                        <td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:600;">${params.clientName}${params.bookingNumber ? ` (#${params.bookingNumber})` : ''}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Leveransadress</td>
                        <td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:500;">${deliveryFull || '—'}</td>
                      </tr>
                      ${params.contactName ? `
                      <tr>
                        <td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Kontaktperson</td>
                        <td style="padding:4px 0;font-size:13px;color:#1a3a3c;font-weight:500;">${params.contactName}${params.contactPhone ? ` · ${params.contactPhone}` : ''}${params.contactEmail ? ` · ${params.contactEmail}` : ''}</td>
                      </tr>` : ''}
                      ${params.rigDate ? `<tr><td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Riggdag</td><td style="padding:4px 0;font-size:13px;color:#1a3a3c;">${formatDate(params.rigDate)}</td></tr>` : ''}
                      ${params.eventDate ? `<tr><td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Eventdag</td><td style="padding:4px 0;font-size:13px;color:#1a3a3c;">${formatDate(params.eventDate)}</td></tr>` : ''}
                      ${params.rigdownDate ? `<tr><td style="padding:4px 0;font-size:13px;color:#7a8b8d;">Nedrigg</td><td style="padding:4px 0;font-size:13px;color:#1a3a3c;">${formatDate(params.rigdownDate)}</td></tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <tr>
            <td style="padding:0 40px 8px;">
              <p style="margin:0;font-size:14px;color:#5a6b6d;text-align:center;">Denna förfrågan innehåller <strong>${params.assignments.length} körningar</strong>. Svara på varje körning individuellt eller acceptera/neka alla.</p>
            </td>
          </tr>` : '';

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
          
          <!-- Logo + Reference bar -->
          <tr>
            <td style="padding:16px 40px;border-bottom:1px solid #e0ecee;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;width:50%;">
                    <img src="https://pihrhltinhewhoxefjxv.supabase.co/storage/v1/object/public/email-assets/fransaugust-logo.png?t=1" alt="Frans August" width="150" height="36" style="height:36px;width:150px;display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;text-align:right;width:50%;">
                    ${params.bookingNumber ? `<p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a8b8d;font-weight:600;">Referensnummer</p>
                    <p style="margin:2px 0 0;font-size:16px;color:#1a3a3c;font-weight:700;">${params.bookingNumber}</p>` : ''}
                    ${params.referencePerson ? `<p style="margin:${params.bookingNumber ? '4' : '0'}px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a8b8d;font-weight:600;">Referensperson</p>
                    <p style="margin:2px 0 0;font-size:14px;color:#1a3a3c;font-weight:600;">${params.referencePerson}</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title + Greeting -->
          <tr>
            <td style="padding:20px 40px 0;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#1a3a3c;letter-spacing:-0.5px;">Transportförfrågan</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#7a8b8d;">
                ${isMulti ? `${params.assignments.length} körningar att granska` : 'Ny körning att granska'} från Frans August Logistik
              </p>
              <hr style="border:none;border-top:1px solid #e0ecee;margin:16px 0;" />
              <p style="margin:0;font-size:15px;color:#1a3a3c;font-weight:600;">Hej ${params.partnerName},</p>
              <p style="margin:6px 0 0;font-size:14px;color:#5a6b6d;line-height:1.6;">
                ${isMulti 
                  ? 'Vi har nya transportförfrågningar som vi gärna vill att ni utför. Se detaljer nedan och svara genom att klicka på knapparna.'
                  : 'Vi har en ny transportförfrågan som vi gärna vill att ni utför. Se detaljer nedan och svara genom att klicka på knapparna.'}
              </p>
              ${customMessageHtml}
            </td>
          </tr>

          ${sharedBookingInfoHtml}
          ${assignmentCardsHtml}

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

    const body = await req.json();
    // Support both single assignment_id and array of assignment_ids
    const assignmentIds: string[] = body.assignment_ids || (body.assignment_id ? [body.assignment_id] : []);
    const { custom_subject, custom_message, reference_person } = body;

    if (assignmentIds.length === 0) throw new Error("assignment_id or assignment_ids is required");

    console.log(`[send-transport-request] Processing ${assignmentIds.length} assignment(s): ${assignmentIds.join(', ')}`);

    // Fetch all assignments
    const { data: assignments, error: assignmentError } = await supabase
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
      .in("id", assignmentIds);

    if (assignmentError) throw new Error(`Assignments not found: ${assignmentError.message}`);
    if (!assignments || assignments.length === 0) throw new Error("No assignments found");

    // All assignments should be for the same vehicle/partner
    const vehicle = assignments[0].vehicle;
    const booking = assignments[0].booking;

    if (!vehicle?.contact_email) {
      throw new Error(`Partner ${vehicle?.name || 'unknown'} har ingen mejladress konfigurerad`);
    }

    // Build response URLs and assignment data
    const responseBaseUrl = `${supabaseUrl}/functions/v1/handle-transport-response`;
    
    const assignmentDataList: AssignmentData[] = assignments.map(a => {
      const token = a.partner_response_token;
      if (!token) throw new Error(`No response token on assignment ${a.id}`);
      
      const vehicleType = a.vehicle_type || 
        (vehicle.provided_vehicle_types && vehicle.provided_vehicle_types.length > 0 
          ? vehicle.provided_vehicle_types[0] 
          : vehicle.vehicle_type);

      return {
        id: a.id,
        transport_date: a.transport_date,
        transport_time: a.transport_time,
        pickup_address: a.pickup_address,
        vehicle_type: vehicleType,
        token,
        acceptUrl: `${responseBaseUrl}?token=${token}&action=accepted`,
        declineUrl: `${responseBaseUrl}?token=${token}&action=declined`,
      };
    });

    const html = buildEmailHtml({
      clientName: booking?.client || "—",
      bookingNumber: booking?.booking_number || null,
      deliveryAddress: booking?.deliveryaddress || null,
      deliveryCity: booking?.delivery_city || null,
      deliveryPostalCode: booking?.delivery_postal_code || null,
      contactName: booking?.contact_name || null,
      contactPhone: booking?.contact_phone || null,
      contactEmail: booking?.contact_email || null,
      partnerName: vehicle.contact_person || vehicle.name,
      rigDate: booking?.rigdaydate || null,
      eventDate: booking?.eventdate || null,
      rigdownDate: booking?.rigdowndate || null,
      customMessage: custom_message || null,
      referencePerson: reference_person || null,
      assignments: assignmentDataList,
    });

    const emailSubject = custom_subject || 
      (assignments.length > 1
        ? `Transportförfrågan: ${booking?.client || 'Bokning'} — ${assignments.length} körningar`
        : `Transportförfrågan: ${booking?.client || 'Bokning'} — ${formatDate(assignments[0].transport_date)}`);

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

    // Update all assignments status to pending
    for (const aId of assignmentIds) {
      await supabase
        .from("transport_assignments")
        .update({ partner_response: "pending" })
        .eq("id", aId);
    }

    // Log the email send for the first assignment (primary)
    const { error: logError } = await supabase
      .from("transport_email_log")
      .insert({
        assignment_id: assignmentIds[0],
        booking_id: booking?.id || assignments[0].booking_id,
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
      JSON.stringify({ success: true, sent_to: vehicle.contact_email, assignments_count: assignmentIds.length }),
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
