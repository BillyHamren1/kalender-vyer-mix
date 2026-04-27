import { useEffect, useState } from 'react';
import {
  clearDiagnostics,
  DiagnosticEvent,
  getDiagnostics,
  subscribeDiagnostics,
} from '@/services/diagnostics/diagnostics';

export function useDiagnostics() {
  const [events, setEvents] = useState<DiagnosticEvent[]>(() => getDiagnostics());

  useEffect(() => {
    return subscribeDiagnostics(() => {
      setEvents(getDiagnostics());
    });
  }, []);

  return {
    events,
    latest: events[0] ?? null,
    clear: clearDiagnostics,
  };
}