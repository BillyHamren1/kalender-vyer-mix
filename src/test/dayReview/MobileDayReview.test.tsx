/**
 * Verkliga UI-tester för MobileDayReview:
 *   • renderar en SYNTETISK dag (utan workday) korrekt
 *   • visar action-knappar som matchar event_type
 *   • klick på "Starta från HH:MM" anropar startWorkFromArrival
 *   • klick på "Irrelevant" anropar dismissEvent
 *   • dolda actions för ovidkommande event_type
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listWorkdaysReview = vi.fn();
const startWorkFromArrival = vi.fn();
const startWorkNow = vi.fn();
const endActivityAtDeparture = vi.fn();
const endWorkDayAtHomeArrival = vi.fn();
const dismissEvent = vi.fn();
const adjustTravel = vi.fn();
const approveWorkday = vi.fn();

vi.mock('@/services/mobileApiService', () => ({
  mobileApi: { listWorkdaysReview },
}));
vi.mock('@/hooks/useDayReviewActions', () => ({
  useDayReviewActions: () => ({
    startWorkFromArrival, startWorkNow, endActivityAtDeparture,
    endWorkDayAtHomeArrival, dismissEvent, adjustTravel, approveWorkday,
  }),
}));
vi.mock('@/i18n/LanguageContext', () => ({ useLanguage: () => ({ locale: 'sv' }) }));

import MobileDayReview from '@/pages/mobile/MobileDayReview';

const renderPage = () =>
  render(
    <MemoryRouter>
      <MobileDayReview />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  startWorkFromArrival.mockResolvedValue(undefined);
  dismissEvent.mockResolvedValue(undefined);
});

describe('MobileDayReview — syntetisk dag', () => {
  it('renderar syntetisk dag och visar korrekt etikett', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [{
        id: 'synthetic:2026-04-22',
        started_at: '2026-04-22T07:30:00.000Z',
        ended_at: null,
        review_status: 'needs_review',
        review_reasons: ['no_workday_started', 'open_assistant_events'],
        day_key: '2026-04-22',
        counts: { open_events: 1, stale_review_events: 0, open_travel: 0 },
        events_for_day: [{
          id: 'ev-1',
          happened_at: '2026-04-22T07:30:00.000Z',
          event_type: 'arrival',
          target_label: 'Lager',
          target_type: 'location',
          target_id: 'loc-1',
          stale_for_prompt: false,
          suggested_action: 'start',
        }],
        synthetic: true,
      }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Ingen arbetsdag startad/i)).toBeInTheDocument());
    expect(screen.getByText(/Behöver granskas/i)).toBeInTheDocument();
    expect(screen.getByText(/Ingen arbetsdag startades/i)).toBeInTheDocument();
  });

  it('visar Starta-från och Starta nu för arrival-event, men inte Avsluta', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [{
        id: 'synthetic:2026-04-22', started_at: '2026-04-22T07:30:00.000Z',
        ended_at: null, review_status: 'needs_review', review_reasons: [],
        day_key: '2026-04-22',
        counts: { open_events: 1, stale_review_events: 0, open_travel: 0 },
        events_for_day: [{
          id: 'ev-1', happened_at: '2026-04-22T07:30:00.000Z',
          event_type: 'arrival', target_label: 'Lager',
          target_type: 'location', target_id: 'loc-1',
          stale_for_prompt: false, suggested_action: 'start',
        }],
        synthetic: true,
      }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/^Starta från/i)).toBeInTheDocument());
    expect(screen.getByText(/Starta nu/i)).toBeInTheDocument();
    expect(screen.getByText(/Irrelevant/i)).toBeInTheDocument();
    expect(screen.queryByText(/Avsluta vid/i)).toBeNull();
    expect(screen.queryByText(/Avsluta dagen/i)).toBeNull();
  });

  it('klick på "Starta från" anropar startWorkFromArrival med eventet', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [{
        id: 'synthetic:2026-04-22', started_at: '2026-04-22T07:30:00.000Z',
        ended_at: null, review_status: 'needs_review', review_reasons: [],
        day_key: '2026-04-22',
        counts: { open_events: 1, stale_review_events: 0, open_travel: 0 },
        events_for_day: [{
          id: 'ev-77', happened_at: '2026-04-22T07:30:00.000Z',
          event_type: 'arrival', target_label: 'Lager',
          target_type: 'location', target_id: 'loc-1',
          stale_for_prompt: false, suggested_action: 'start',
        }],
        synthetic: true,
      }],
    });

    renderPage();

    const btn = await screen.findByText(/^Starta från/i);
    fireEvent.click(btn);

    await waitFor(() => expect(startWorkFromArrival).toHaveBeenCalled());
    expect(startWorkFromArrival.mock.calls[0][0]).toMatchObject({ id: 'ev-77' });
  });

  it('klick på "Irrelevant" anropar dismissEvent med id', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [{
        id: 'wd-1', started_at: '2026-04-22T07:30:00.000Z',
        ended_at: null, review_status: 'needs_review', review_reasons: [],
        day_key: '2026-04-22',
        counts: { open_events: 1, stale_review_events: 0, open_travel: 0 },
        events_for_day: [{
          id: 'ev-irr', happened_at: '2026-04-22T07:30:00.000Z',
          event_type: 'unknown_thing', target_label: 'X',
          target_type: 'location', target_id: 'loc-1',
          stale_for_prompt: false, suggested_action: 'none',
        }],
        synthetic: false,
      }],
    });

    renderPage();

    const btn = await screen.findByText(/Irrelevant/i);
    fireEvent.click(btn);

    await waitFor(() => expect(dismissEvent).toHaveBeenCalledWith('ev-irr'));
  });

  it('visar bara "Avsluta dagen" för home_arrival-event', async () => {
    listWorkdaysReview.mockResolvedValue({
      workdays: [{
        id: 'wd-1', started_at: '2026-04-22T07:30:00.000Z',
        ended_at: null, review_status: 'needs_review', review_reasons: [],
        day_key: '2026-04-22',
        counts: { open_events: 1, stale_review_events: 0, open_travel: 0 },
        events_for_day: [{
          id: 'ev-home', happened_at: '2026-04-22T18:00:00.000Z',
          event_type: 'home_arrival', target_label: 'Hem',
          target_type: 'location', target_id: 'home-1',
          stale_for_prompt: false, suggested_action: 'end_day',
        }],
        synthetic: false,
      }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/Avsluta dagen/i)).toBeInTheDocument());
    expect(screen.queryByText(/^Starta från/i)).toBeNull();
    expect(screen.queryByText(/Avsluta vid/i)).toBeNull();
  });
});
