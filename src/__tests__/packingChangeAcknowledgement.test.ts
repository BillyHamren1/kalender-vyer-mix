import { describe, expect, it } from 'vitest';
import {
  isShortNotice,
  requiresWarehouseAcknowledgement,
} from '../../supabase/functions/_shared/packingChangeRequests';

describe('packing change acknowledgement policy', () => {
  it('syncar tyst när det är minst 14 dagar kvar och packningen inte har startat', () => {
    expect(isShortNotice(14)).toBe(false);
    expect(requiresWarehouseAcknowledgement({ daysUntilRig: 14, packingStatus: 'planning' })).toBe(false);
    expect(requiresWarehouseAcknowledgement({ daysUntilRig: 30, packingStatus: 'planning' })).toBe(false);
  });

  it('kräver lagerattest när det är mindre än 14 dagar kvar', () => {
    expect(isShortNotice(13)).toBe(true);
    expect(requiresWarehouseAcknowledgement({ daysUntilRig: 13, packingStatus: 'planning' })).toBe(true);
  });

  it('kräver alltid lagerattest när packningen är påbörjad', () => {
    expect(requiresWarehouseAcknowledgement({ daysUntilRig: 30, packingStatus: 'in_progress' })).toBe(true);
    expect(requiresWarehouseAcknowledgement({
      daysUntilRig: 30,
      packingStatus: 'planning',
      hasPackedQuantity: true,
    })).toBe(true);
  });
});