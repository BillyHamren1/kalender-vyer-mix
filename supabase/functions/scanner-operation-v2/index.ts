// SCANNER HARDENING – STEG 8: WMS-first command gateway (Planning-sidan).
//
// Flödet är strikt: scan → command → WMS → authoritative response → projection.
// Planning gör ALDRIG egen aritmetik och skriver ALDRIG lokalt före WMS.
// packing_list_items.quantity_packed uppdateras endast som read model/cache
// med WMS auktoritativa värde, aldrig som beslutsunderlag.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const WMS_GATEWAY_URL =
  Deno.env.get('WMS_COMMAND_GATEWAY_URL') ||
  'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/scanner-command-gateway'

type CommandType =
  | 'PACK_QUANTITY'
  | 'UNPACK_QUANTITY'
  | 'PACK_INSTANCE'
  | 'UNPACK_INSTANCE'
  | 'RESET_ITEM'
  | 'VERIFY_PRODUCT'
  | 'RETURN_INSTANCE'
  | 'RETURN_QUANTITY'

const ALLOWED: CommandType[] = [
  'PACK_QUANTITY',
  'UNPACK_QUANTITY',
  'PACK_INSTANCE',
  'UNPACK_INSTANCE',
  'RESET_ITEM',
  'VERIFY_PRODUCT',
  'RETURN_INSTANCE',
  'RETURN_QUANTITY',
]

const mapWmsStatus = (httpStatus: number, body: any): string => {
  const explicit = String(body?.status || '').toLowerCase()
  if (explicit && ['accepted', 'rejected', 'wrong_booking', 'over_capacity', 'not_found', 'duplicate'].includes(explicit)) {
    return explicit
  }
  if (httpStatus === 200 || httpStatus === 201) return 'accepted'
  if (httpStatus === 404) return 'not_found'
  if (httpStatus === 409) return body?.code === 'OVER_CAPACITY' ? 'over_capacity' : 'wrong_booking'
  if (httpStatus === 422) return 'over_capacity'
  return 'rejected'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token, command } = await req.json()
    if (!token) return json({ status: 'rejected', error: 'Missing token', debugCode: 'AUTH_MISSING' }, 401)
    if (!command?.operationId || !command?.type || !command?.packingId) {
      return json({ status: 'rejected', error: 'Invalid command', debugCode: 'BAD_COMMAND' }, 400)
    }
    if (!ALLOWED.includes(command.type)) {
      return json({ status: 'rejected', error: `Unknown command ${command.type}`, debugCode: 'BAD_COMMAND_TYPE' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const apiKey = Deno.env.get('PRICELIST_API_KEY')
    if (!apiKey) {
      return json({ status: 'rejected', operationId: command.operationId, error: 'Lagersystem ej konfigurerat', debugCode: 'WMS_NOT_CONFIGURED' })
    }

    // 1) WMS FIRST. Inget lokalt skrivs innan detta svar.
    let wmsBody: any = null
    let wmsStatus = 0
    try {
      const resp = await fetch(WMS_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'x-idempotency-key': command.operationId,
        },
        body: JSON.stringify({
          operation_id: command.operationId,
          command_type: command.type,
          packing_id: command.packingId,
          item_id: command.itemId ?? null,
          serial_number: command.serialNumber ?? null,
          sku: command.sku ?? null,
          quantity_delta: command.quantityDelta ?? null,
          booking_number: command.bookingNumber ?? null,
          parcel_id: command.parcelId ?? null,
          session_id: command.sessionId ?? null,
          performed_by: command.performedBy ?? null,
        }),
      })
      wmsStatus = resp.status
      const text = await resp.text()
      try { wmsBody = JSON.parse(text) } catch { wmsBody = { raw: text } }
    } catch (e) {
      return json({
        status: 'rejected',
        operationId: command.operationId,
        itemId: command.itemId ?? null,
        message: 'WMS otillgängligt',
        debugCode: 'WMS_UNREACHABLE',
        error: String(e),
      })
    }

    const status = mapWmsStatus(wmsStatus, wmsBody)
    const itemId = wmsBody?.item_id ?? command.itemId ?? null
    const packedQuantity =
      typeof wmsBody?.packed_quantity === 'number' ? wmsBody.packed_quantity : null
    const requiredQuantity =
      typeof wmsBody?.required_quantity === 'number' ? wmsBody.required_quantity : null
    const returnedQuantity =
      typeof wmsBody?.returned_quantity === 'number' ? wmsBody.returned_quantity : null

    // 2) Projection ENDAST vid accepterat svar och endast med WMS värde.
    if ((status === 'accepted' || status === 'duplicate') && itemId && packedQuantity !== null) {
      const patch: Record<string, unknown> = {
        quantity_packed: packedQuantity,
        updated_at: new Date().toISOString(),
      }
      if (returnedQuantity !== null) patch.quantity_returned = returnedQuantity
      const { error } = await supabase
        .from('packing_list_items')
        .update(patch)
        .eq('id', itemId)
      if (error) {
        console.warn('[scanner-operation-v2] projection_write_failed', { itemId, error: error.message })
      }
    }

    return json({
      status,
      operationId: command.operationId,
      itemId,
      productName: wmsBody?.product_name ?? null,
      packedQuantity,
      requiredQuantity,
      returnedQuantity,
      message: wmsBody?.message ?? wmsBody?.error ?? null,
      debugCode: wmsBody?.code ?? (status === 'accepted' ? null : `WMS_${wmsStatus}`),
      replayed: Boolean(wmsBody?.replayed || status === 'duplicate'),
    })
  } catch (e) {
    return json({ status: 'rejected', error: String(e), debugCode: 'GATEWAY_EXCEPTION' }, 500)
  }
})
