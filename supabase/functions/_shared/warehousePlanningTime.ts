const zone = 'Europe/Stockholm';
export function warehousePlanningDate(value: string | Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
/** UTC instant for Stockholm midnight, including DST transition days. */
function midnight(date: string): number {
  const target = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date)
    throw new Error('Invalid warehouse date');
  let instant = target;
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    instant += target - wall;
  }
  return instant;
}
export function warehousePlanningBounds(from: string, to: string) {
  midnight(to); // Validate before constructing the next calendar date.
  const nextDate = new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { start: new Date(midnight(from)).toISOString(), end: new Date(midnight(nextDate)).toISOString() };
}

/** Strict Stockholm wall clock -> explicit UTC, independent of server timezone.
 * Enumerate possible UTC offsets and round-trip: gaps and overlaps fail closed.
 */
export function stockholmLocalInstant(date: string, time: string): string {
  const wall = `${date}T${time}`;
  const target = Date.parse(`${wall}Z`);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(wall) ||
      !Number.isFinite(target) || new Date(target).toISOString().slice(0, 19) !== wall) {
    throw new Error('Invalid warehouse local time');
  }
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const matches: number[] = [];
  // Modern Stockholm uses CET and CEST; both must be considered at transitions.
  for (const offset of [60, 120]) {
    const instant = target - offset * 60000;
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` === wall) matches.push(instant);
  }
  if (matches.length !== 1) throw new Error('Nonexistent or ambiguous warehouse local time');
  return new Date(matches[0]).toISOString();
}
