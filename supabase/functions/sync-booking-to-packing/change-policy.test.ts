import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  isShortNotice,
  requiresWarehouseAcknowledgement,
} from '../_shared/packingChangeRequests.ts'

Deno.test('ändringar synkas tyst vid minst 14 dagar och opåbörjad packning', () => {
  assertEquals(isShortNotice(14), false)
  assertEquals(requiresWarehouseAcknowledgement({
    daysUntilRig: 14,
    packingStatus: 'planning',
  }), false)
})

Deno.test('ändringar kräver lagerattest under 14 dagar eller efter packstart', () => {
  assertEquals(requiresWarehouseAcknowledgement({
    daysUntilRig: 13,
    packingStatus: 'planning',
  }), true)
  assertEquals(requiresWarehouseAcknowledgement({
    daysUntilRig: 30,
    packingStatus: 'in_progress',
  }), true)
  assertEquals(requiresWarehouseAcknowledgement({
    daysUntilRig: 30,
    packingStatus: 'planning',
    hasPackedQuantity: true,
  }), true)
})