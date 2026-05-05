import React from 'react';
import { Loader2, ScanLine, Check, AlertTriangle, AlertCircle, Send, Wifi } from 'lucide-react';
import { useScanTimeline } from '@/hooks/scanner/useScanTimeline';
import type { ScanStatus } from '@/hooks/scanner/scanTimeline';

interface LiveScanStatusBarProps {
  /** Show the inline timing line ("Kamera: 0 ms · API: 842 ms · Total: 911 ms") */
  showTiming?: boolean;
}

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-sky-100 text-sky-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

const STATUS_META: Record<ScanStatus, { label: string; tone: Tone; Icon: React.ComponentType<{ className?: string }> }> = {
  detected:         { label: 'Kod hittad',                tone: 'info',    Icon: ScanLine },
  queued:           { label: 'I kö – skickar…',           tone: 'info',    Icon: Send },
  sent_to_backend:  { label: 'Verifierar mot WMS…',       tone: 'info',    Icon: Wifi },
  success:          { label: 'Klar',                      tone: 'success', Icon: Check },
  duplicate:        { label: 'Redan scannad',             tone: 'warning', Icon: AlertTriangle },
  overscan:         { label: 'För många scannade',        tone: 'warning', Icon: AlertTriangle },
  unknown_product:  { label: 'Okänd produkt',             tone: 'warning', Icon: AlertCircle },
  failed:           { label: 'Kunde inte verifiera',      tone: 'error',   Icon: AlertCircle },
  error:            { label: 'Fel',                       tone: 'error',   Icon: AlertCircle },
};

const fmtMs = (n?: number) => (typeof n === 'number' ? `${Math.round(n)} ms` : '–');

/**
 * LiveScanStatusBar — derives a single, non-flickering status line from
 * the latest scanTimeline entry. Shows the entire scan pipeline in one
 * place: waiting → detected → queued → sent → result. Anti-flicker by
 * design: only the most recent entry is rendered, even if multiple scans
 * fly through within a few hundred ms (older ones live in the recent
 * scans list).
 */
export const LiveScanStatusBar: React.FC<LiveScanStatusBarProps> = ({ showTiming }) => {
  const timeline = useScanTimeline();
  const latest = timeline[0];

  if (!latest) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium border-b bg-muted text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 opacity-60" />
        <span className="flex-1">Väntar på kod…</span>
      </div>
    );
  }

  const meta = STATUS_META[latest.status] ?? STATUS_META.error;
  const inFlight = latest.status === 'detected' || latest.status === 'queued' || latest.status === 'sent_to_backend';
  const tail = latest.value.length > 14 ? `…${latest.value.slice(-12)}` : latest.value;
  const display = latest.productName || tail;

  return (
    <div className={`shrink-0 flex flex-col gap-0.5 px-3 py-1.5 text-[12px] font-medium border-b ${TONE_CLASS[meta.tone]}`}>
      <div className="flex items-center gap-2 min-w-0">
        {inFlight
          ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          : <meta.Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="font-semibold shrink-0">{meta.label}</span>
        <span className="opacity-50">·</span>
        <span className="flex-1 min-w-0 truncate">{display}</span>
        <span className="font-mono text-[10px] opacity-70 shrink-0 hidden sm:inline">{latest.source}</span>
      </div>
      {showTiming && (
        <div className="text-[10px] font-mono opacity-70 pl-5">
          Kamera: {fmtMs(latest.cameraToProcessorMs)} ·
          {' '}API: {fmtMs(latest.apiRoundtripMs)} ·
          {' '}Total: {fmtMs(latest.totalScanMs)}
        </div>
      )}
    </div>
  );
};
