-- Engångsfix: stoppa öppna eftermiddags-LTE för Raivis & Markuss Minalto kl 16:30 lokal tid (14:30 UTC) 2026-04-21.
-- Nuvarande exited_at är 21:59 UTC (auto-EOD-cutoff). Vi sätter dem till 14:30 UTC och låter
-- sync_location_entry_to_time_report-triggern uppdatera motsvarande time_reports-rad automatiskt
-- (ON CONFLICT (source_entry_id) DO UPDATE).

DO $$
DECLARE
  _cutoff timestamptz := '2026-04-21 14:30:00+00';
BEGIN
  -- Raivis Minalto: LTE 14:38:51 → ska sluta 14:30. Eftersom 14:30 < 14:38 hade gett negativ tid,
  -- vi sätter istället exited_at = entered_at + 0 ⇒ raden raderas av triggern (hours <= 0).
  -- Bättre: sätt exited_at till entered_at + 1 minut så raden behålls som "kort närvaro".
  -- MEN: användaren vill att han loggas ut 16:30. Eftersom han registrerades efter 16:30
  -- (14:38 UTC = 16:38 CEST) tolkar vi det som att hela passet ska bort.
  UPDATE public.location_time_entries
  SET exited_at = entered_at  -- triggern raderar time_report när hours <= 0
  WHERE id = '3f1cc72d-aece-4a75-88e0-7397c137e5d7';

  -- Markuss Minalto eftermiddagspass 14:53:27 → samma situation (startade 16:53 CEST efter 16:30).
  -- Hela passet bort.
  UPDATE public.location_time_entries
  SET exited_at = entered_at
  WHERE id = '8c9cf2f4-589f-4294-9c77-748f1d2369fb';

  -- Markuss kort pass 14:03–14:21 (18 min) lämnas orört — det var före 16:30.
  -- Markuss förmiddagspass 07:08–14:03 (414 min) lämnas orört.
END $$;

-- Rensa de motsvarande time_reports-raderna (säkerhetsbälte ifall triggern inte raderar dem)
DELETE FROM public.time_reports
WHERE source_entry_id IN (
  '3f1cc72d-aece-4a75-88e0-7397c137e5d7',
  '8c9cf2f4-589f-4294-9c77-748f1d2369fb'
);