import type { DaySegment } from './dayPartition';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';

export interface DayCloser {
  /** Kort fakta-text om hur dagen faktiskt avslutades. */
  text: string;
}

interface BuildArgs {
  /** Sista synliga rapport-radens segment (måste komma från samma listas filter). */
  reportRows: DaySegment[];
  /** Hela dagens rå-segment (work/travel/private/unknown_place/gps_gap/idle). */
  rawSegments: DaySegment[];
  /** Sista faktiska ping (summary.lastIso). */
  actualLastPingIso?: string | null;
}

function isHomeLike(seg: DaySegment | undefined): boolean {
  if (!seg) return false;
  if (seg.type === 'private') return true;
  const label = `${seg.label ?? ''} ${seg.toLabel ?? ''}`.toLowerCase();
  return /\bhem\b|\bhome\b|\bbostad\b|\bprivat\b/.test(label);
}

function fmtDur(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function hiddenKindLabel(t: DaySegment['type']): string | null {
  if (t === 'private') return 'privat';
  if (t === 'unknown_place') return 'okänt';
  if (t === 'gps_gap') return 'GPS-glapp';
  if (t === 'travel') return 'intern rörelse';
  return null;
}

/**
 * Returnera en faktabaserad beskrivning av hur dagen avslutades baserat ENBART
 * på vad rå-segmenten faktiskt visar efter sista rapport-rad. Aldrig en gissning
 * om batteri/app/GPS — bara observerade händelser eller null.
 */
export function buildDayCloser({
  reportRows,
  rawSegments,
  actualLastPingIso,
}: BuildArgs): DayCloser | null {
  if (!rawSegments?.length || !reportRows?.length) return null;

  const lastReportEnd = reportRows[reportRows.length - 1]?.end;
  if (!lastReportEnd) return null;
  const lastReportEndMs = new Date(lastReportEnd).getTime();
  if (Number.isNaN(lastReportEndMs)) return null;

  // Allt som ligger EFTER sista rapport-rad (lite slack för exakt-end-match).
  const after = rawSegments.filter((s) => {
    const startMs = new Date(s.start).getTime();
    return !Number.isNaN(startMs) && startMs >= lastReportEndMs - 60_000 && s.start !== lastReportEnd ? startMs >= lastReportEndMs : false;
  });
  // Enklare och mer pålitlig version:
  const afterSegments = rawSegments.filter((s) => {
    const startMs = new Date(s.start).getTime();
    return !Number.isNaN(startMs) && startMs >= lastReportEndMs;
  });

  // Hitta första travel + första private efter sista rapport-rad.
  const firstTravel = afterSegments.find((s) => s.type === 'travel');
  const firstPrivate = afterSegments.find((s) => s.type === 'private');

  const lastReportLabel =
    reportRows[reportRows.length - 1]?.toLabel?.trim() ||
    reportRows[reportRows.length - 1]?.label?.trim() ||
    firstTravel?.fromLabel?.trim() ||
    'arbetsplatsen';

  // Fall 1: Resa till hem/privat → dagen avslutades genom att personen åkte hem.
  if (firstTravel) {
    const arrivedHome =
      isHomeLike(firstPrivate) ||
      isHomeLike(firstTravel) ||
      (firstTravel.toLabel ?? '').toLowerCase().includes('hem');
    if (arrivedHome) {
      const from = firstTravel.fromLabel?.trim() || lastReportLabel;
      return {
        text: `Arbetsdagen avslutades — ${formatStockholmHm(firstTravel.start)} resa från ${from} → Hem.`,
      };
    }
    // Resa utan känt mål — bara fakta.
    const from = firstTravel.fromLabel?.trim() || lastReportLabel;
    return {
      text: `${formatStockholmHm(firstTravel.start)} resa från ${from}. Inga fler arbetsplats-pings efter detta.`,
    };
  }

  // Fall 2: Direkt private utan resa → "X → privat/hem".
  if (firstPrivate) {
    const homeWord = isHomeLike(firstPrivate) ? 'Hem' : 'privat';
    return {
      text: `Arbetsdagen avslutades — ${formatStockholmHm(firstPrivate.start)} ${lastReportLabel} → ${homeWord}.`,
    };
  }

  // Fall 3: Pings fortsätter (dolda kategorier som unknown/gap) utan resa eller hem.
  const hiddenAfter = afterSegments.filter((s) => s.minutes >= 1 && s.type !== 'work');
  if (hiddenAfter.length > 0 && actualLastPingIso) {
    const lastMs = new Date(actualLastPingIso).getTime();
    if (!Number.isNaN(lastMs) && lastMs - lastReportEndMs >= 2 * 60_000) {
      const kinds = Array.from(
        new Set(hiddenAfter.map((s) => hiddenKindLabel(s.type)).filter((x): x is string => !!x)),
      );
      const totalMin = hiddenAfter.reduce((a, b) => a + b.minutes, 0);
      const kindsText = kinds.length ? ` (dolt: ${kinds.join(', ')}, ${fmtDur(totalMin)})` : '';
      return {
        text: `Pings fortsatte till ${formatStockholmHm(actualLastPingIso)}${kindsText}. Ingen ny arbetsplats.`,
      };
    }
  }

  return null;
}
