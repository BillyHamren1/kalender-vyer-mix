import type { ReportCandidateBlockUI } from '@/components/staff/ReportCandidateTimeline';

const STOCKHOLM_TIME_PREFIX_RE = /^\d{2}:\d{2}[–-](?:\d{2}:\d{2}|\s*pågår)(?:\s*[·•]\s*)?/i;
const DURATION_ONLY_RE = /^\d+h(?:\s*\d+m)?$|^\d+m$/i;
const DURATION_SUFFIX_RE = /(?:\s*[·•]\s*)?(?:\d+h(?:\s*\d+m)?|\d+m)$/i;

export function getGanttDisplaySubtitle(block: Pick<ReportCandidateBlockUI, 'subtitle'>): string | null {
  const raw = block.subtitle?.trim();
  if (!raw) return null;
  const withoutTimePrefix = raw.replace(STOCKHOLM_TIME_PREFIX_RE, '').trim();
  if (!withoutTimePrefix || DURATION_ONLY_RE.test(withoutTimePrefix)) return null;
  const cleaned = withoutTimePrefix.replace(DURATION_SUFFIX_RE, '').trim();
  return cleaned || null;
}