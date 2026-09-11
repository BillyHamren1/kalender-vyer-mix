export type PackingPreflightStatus = 'PASS' | 'WARNING' | 'BLOCKED'

export interface PackingPreflightWmsMatch {
  id: string | null
  sku: string | null
  name: string | null
  matchedBy: string
}

export interface PackingPreflightVerdict {
  status: PackingPreflightStatus
  reason: string
  suggestedFix: string | null
  wmsMatches: PackingPreflightWmsMatch[]
  resolvedItemTypeId: string | null
}

export interface PackingPreflightSourceItem {
  excluded?: boolean | null
  quantity_to_pack?: number | null
  booking_products?: {
    id?: string | null
    parent_product_id?: string | null
    source_missing_since?: string | null
  } | null
}

const normalizeSku = (value: string | null | undefined) =>
  value?.trim().toLocaleUpperCase('sv-SE') || null

const dedupeMatches = (matches: PackingPreflightWmsMatch[]) => {
  const seen = new Set<string>()
  return matches.filter((match) => {
    const key = match.id || `${normalizeSku(match.sku) || ''}|${match.name || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Uses the same structural definition of a packable row as packing integrity:
 * inactive rows, zero-quantity rows and package headers are not physical scan
 * targets. Manual/legacy leaf rows remain visible and are classified below;
 * names are never used to silently decide that a physical row is a service.
 */
export const collectPackingPackageHeaderIds = (items: PackingPreflightSourceItem[]) =>
  new Set(
    items
      .map((item) => item.booking_products?.parent_product_id)
      .filter((id): id is string => Boolean(id)),
  )

export const isPackingPreflightTarget = (
  item: PackingPreflightSourceItem,
  packageHeaderIds: ReadonlySet<string>,
) => {
  if (item.excluded) return false
  if (Number(item.quantity_to_pack ?? 0) <= 0) return false
  const product = item.booking_products
  if (product?.source_missing_since) return false
  if (product?.id && packageHeaderIds.has(product.id)) return false
  return true
}

/**
 * Classifies identity quality without confusing repairable legacy data with a
 * physical packing conflict. Only contradictory canonical signals or an
 * ambiguous SKU block. Missing/stale identity remains visible as WARNING and
 * manual packing may continue; name matches never become canonical identity.
 */
export function classifyPackingPreflightRow(args: {
  inventoryItemTypeId: string | null
  sku: string | null
  byItemTypeId: PackingPreflightWmsMatch[]
  bySku: PackingPreflightWmsMatch[]
  byName: PackingPreflightWmsMatch[]
}): PackingPreflightVerdict {
  const { inventoryItemTypeId, sku, byItemTypeId, bySku, byName } = args
  const wmsMatches = dedupeMatches([...byItemTypeId, ...bySku, ...byName])

  if (byItemTypeId.length > 1) {
    return {
      status: 'BLOCKED',
      reason: 'WMS returnerade flera item_types för samma inventory_item_type_id.',
      suggestedFix: 'Rensa den tvetydiga WMS-identiteten innan scanning.',
      wmsMatches,
      resolvedItemTypeId: null,
    }
  }

  if (bySku.length > 1) {
    return {
      status: 'BLOCKED',
      reason: 'SKU matchar flera WMS item_types — rätt fysisk artikel kan inte avgöras.',
      suggestedFix: 'Välj rätt WMS item_type och gör SKU unik innan scanning.',
      wmsMatches,
      resolvedItemTypeId: null,
    }
  }

  if (byItemTypeId.length === 1) {
    const exact = byItemTypeId[0]
    const skuMatch = bySku[0] || null
    if (skuMatch?.id && exact.id && skuMatch.id !== exact.id) {
      return {
        status: 'BLOCKED',
        reason: 'Sparat item_type_id och SKU pekar på olika WMS-artiklar.',
        suggestedFix: 'Bekräfta rätt fysisk artikel och reparera WMS-kopplingen innan scanning.',
        wmsMatches,
        resolvedItemTypeId: null,
      }
    }

    if (sku && exact.sku && normalizeSku(sku) !== normalizeSku(exact.sku)) {
      return {
        status: 'WARNING',
        reason: `WMS bekräftar item_type_id men SKU skiljer sig (${exact.sku} i WMS, ${sku} i Booking).`,
        suggestedFix: 'Synka SKU från WMS. Manuell packning får fortsätta.',
        wmsMatches,
        resolvedItemTypeId: exact.id,
      }
    }

    return {
      status: 'PASS',
      reason: 'WMS bekräftar item_type_id.',
      suggestedFix: null,
      wmsMatches,
      resolvedItemTypeId: exact.id,
    }
  }

  if (bySku.length === 1) {
    const resolved = bySku[0]
    return {
      status: 'WARNING',
      reason: inventoryItemTypeId
        ? 'Sparat item_type_id är gammalt, men SKU matchar entydigt i WMS.'
        : 'inventory_item_type_id saknas, men SKU matchar entydigt i WMS.',
      suggestedFix: `Reparera canonical item_type_id till ${resolved.id ?? '<wms-id>'}. Packning behöver inte blockeras.`,
      wmsMatches,
      resolvedItemTypeId: resolved.id,
    }
  }

  if (inventoryItemTypeId) {
    return {
      status: 'WARNING',
      reason: 'Sparat item_type_id finns inte längre i WMS. Detta är en identitetsreparation, inte en fysisk lagerkonflikt.',
      suggestedFix: 'Reparera WMS-kopplingen. Manuell avbockning får fortsätta med tydlig varning.',
      wmsMatches,
      resolvedItemTypeId: null,
    }
  }

  if (sku) {
    return {
      status: 'WARNING',
      reason: byName.length > 0
        ? 'Sparad SKU saknar WMS-träff; endast en osäker namnmatch finns.'
        : 'Sparad SKU saknar WMS-träff. WMS-identiteten behöver repareras.',
      suggestedFix: 'Koppla rätt WMS item_type. Manuell avbockning får fortsätta med tydlig varning.',
      wmsMatches,
      resolvedItemTypeId: null,
    }
  }

  return {
    status: 'WARNING',
    reason: byName.length > 0
      ? 'Legacy-rad utan WMS-ID/SKU. Namnmatch används inte som canonical identitet.'
      : 'Legacy-rad saknar canonical WMS-identitet.',
    suggestedFix: 'Reparera WMS-kopplingen. Manuell avbockning är tillåten med varning.',
    wmsMatches,
    resolvedItemTypeId: null,
  }
}
