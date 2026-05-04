import { describe, it, expect } from 'vitest';
import {
  classifyReviewRow,
  countsInDistributedMinutes,
  SECTION_FOR_KIND,
  type ReviewRowKind,
} from '../reviewRowKind';

describe('reviewRowKind classifier', () => {
  it('öppen time_report → active_distribution (Pågående aktivitet)', () => {
    const k = classifyReviewRow({ sourceTable: 'time_report', closed: false });
    expect(k).toBe('active_distribution');
    expect(SECTION_FOR_KIND[k]).toBe('active_activity');
    expect(countsInDistributedMinutes(k)).toBe(false);
  });

  it('stängd time_report → confirmed_distribution och räknas i Fördelad', () => {
    const k = classifyReviewRow({ sourceTable: 'time_report', closed: true, approved: false });
    expect(k).toBe('confirmed_distribution');
    expect(countsInDistributedMinutes(k)).toBe(true);
  });

  it('en öppen Craft-timer hamnar EJ i confirmed-tabellen och räknar EJ i Fördelad-totalen', () => {
    // Det här är hela bug-scenariot: en öppen Craft-timer fick tidigare
    // visas under "Fördelad tid · per projekt/plats" trots att headern
    // sa Fördelad 0h. Med den nya taxonomin är det omöjligt.
    const craftOpen = classifyReviewRow({ sourceTable: 'time_report', closed: false });
    expect(SECTION_FOR_KIND[craftOpen]).not.toBe('confirmed_distribution');
    expect(countsInDistributedMinutes(craftOpen)).toBe(false);
  });

  it('Lager LTE source=manual, öppen → active_distribution', () => {
    const k = classifyReviewRow({
      sourceTable: 'location_entry',
      closed: false,
      isLocationWorkTimer: true,
    });
    expect(k).toBe('active_distribution');
  });

  it('Lager LTE source=manual, stängd → confirmed_distribution', () => {
    const k = classifyReviewRow({
      sourceTable: 'location_entry',
      closed: true,
      isLocationWorkTimer: true,
    });
    expect(k).toBe('confirmed_distribution');
    expect(countsInDistributedMinutes(k)).toBe(true);
  });

  it('Lager LTE klassad som presence-only → presence_evidence (aldrig fördelning)', () => {
    const k = classifyReviewRow({
      sourceTable: 'location_entry',
      closed: true,
      isLocationWorkTimer: false,
    });
    expect(k).toBe('presence_evidence');
    expect(countsInDistributedMinutes(k)).toBe(false);
    expect(SECTION_FOR_KIND[k]).toBe('event_journal');
  });

  it('GPS-närvaro på Lager utan timer → presence_evidence i händelsejournalen', () => {
    const k = classifyReviewRow({ sourceTable: 'gps_stay_point', closed: true });
    expect(k).toBe('presence_evidence');
    expect(SECTION_FOR_KIND[k]).toBe('event_journal');
    expect(countsInDistributedMinutes(k)).toBe(false);
  });

  it('gap_derived travel ej godkänd → travel_suggestion (egen sektion, ej extra lön)', () => {
    const k = classifyReviewRow({
      sourceTable: 'travel_log',
      closed: true,
      approved: false,
      travelAutoDetected: true,
    });
    expect(k).toBe('travel_suggestion');
    expect(SECTION_FOR_KIND[k]).toBe('suggestions');
    expect(countsInDistributedMinutes(k)).toBe(false);
  });

  it('godkänd travel → confirmed_distribution', () => {
    const k = classifyReviewRow({
      sourceTable: 'travel_log',
      closed: true,
      approved: true,
      travelAutoDetected: true,
    });
    expect(k).toBe('confirmed_distribution');
    expect(countsInDistributedMinutes(k)).toBe(true);
  });

  it('workday_flag → anomaly i händelsejournalen, aldrig fördelad tid', () => {
    const k = classifyReviewRow({ sourceTable: 'workday_flag', closed: true });
    expect(k).toBe('anomaly');
    expect(SECTION_FOR_KIND[k]).toBe('event_journal');
    expect(countsInDistributedMinutes(k)).toBe(false);
  });

  it('gps_gap → gps_evidence i debug, inte fördelning', () => {
    const k = classifyReviewRow({ sourceTable: 'gps_gap', closed: true });
    expect(k).toBe('gps_evidence');
    expect(SECTION_FOR_KIND[k]).toBe('debug_gps');
    expect(countsInDistributedMinutes(k)).toBe(false);
  });

  it('assistant_event → suggested_distribution (kräver godkännande)', () => {
    const k = classifyReviewRow({ sourceTable: 'assistant_event', closed: true });
    expect(k).toBe('suggested_distribution');
    expect(SECTION_FOR_KIND[k]).toBe('suggestions');
    expect(countsInDistributedMinutes(k)).toBe(false);
  });

  it('endast confirmed_distribution räknas i distributedMinutes (kontraktslås)', () => {
    const allKinds: ReviewRowKind[] = [
      'confirmed_distribution',
      'active_distribution',
      'suggested_distribution',
      'presence_evidence',
      'gps_evidence',
      'anomaly',
      'travel_suggestion',
    ];
    const counted = allKinds.filter(countsInDistributedMinutes);
    expect(counted).toEqual(['confirmed_distribution']);
  });
});
