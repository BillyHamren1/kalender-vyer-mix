// Deno unit-tests för pickPulseCandidates.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { pickPulseCandidates } from './index.ts'

const NOW = '2026-05-25T12:00:00.000Z'

const tokens = [
  { id: 't1', staff_id: 'staff-a', token: 'tokA', platform: 'ios', organization_id: 'org1' },
  { id: 't2', staff_id: 'staff-b', token: 'tokB', platform: 'android', organization_id: 'org1' },
  { id: 't3', staff_id: 'staff-c', token: 'tokC', platform: 'ios', organization_id: 'org1' },
  // staff-a med två enheter — båda ska pulsas tillsammans
  { id: 't4', staff_id: 'staff-a', token: 'tokA2', platform: 'android', organization_id: 'org1' },
]

Deno.test('staff utan någon ping kommer alltid med', () => {
  const last = new Map<string, string | null>()
  const out = pickPulseCandidates(tokens as any, last, NOW, 9)
  assertEquals(out.length, 4)
})

Deno.test('staff med färsk ping (<9 min) hoppas över', () => {
  const last = new Map<string, string | null>([
    ['staff-a', '2026-05-25T11:55:00.000Z'], // 5 min sedan → färsk
    ['staff-b', '2026-05-25T11:45:00.000Z'], // 15 min sedan → puls
    ['staff-c', '2026-05-25T11:58:00.000Z'], // 2 min sedan → färsk
  ])
  const out = pickPulseCandidates(tokens as any, last, NOW, 9)
  assertEquals(out.map(t => t.id).sort(), ['t2'])
})

Deno.test('båda enheterna för samma staff pulsas', () => {
  const last = new Map<string, string | null>([
    ['staff-a', '2026-05-25T11:30:00.000Z'], // 30 min sedan
    ['staff-b', '2026-05-25T11:59:00.000Z'],
    ['staff-c', '2026-05-25T11:59:00.000Z'],
  ])
  const out = pickPulseCandidates(tokens as any, last, NOW, 9)
  assertEquals(out.map(t => t.id).sort(), ['t1', 't4'])
})

Deno.test('cutoff på exakt intervallgränsen räknas som färsk', () => {
  const last = new Map<string, string | null>([
    ['staff-a', '2026-05-25T11:51:00.000Z'], // exakt 9 min sedan
  ])
  const out = pickPulseCandidates(
    [tokens[0]] as any, last, NOW, 9,
  )
  // strict <, så exakt 9 min anses fortfarande färsk
  assertEquals(out.length, 0)
})

// --- Kontraktstest: ingen active-context-gating får återkomma ---
Deno.test('source: ingen referens till active_time_registrations', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  if (src.includes('active_time_registrations')) {
    throw new Error('gps-heartbeat-pulse får aldrig läsa active_time_registrations')
  }
})

Deno.test('source: reason "no_active_context" får inte finnas', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  if (src.includes('no_active_context')) {
    throw new Error('reason "no_active_context" får inte återkomma')
  }
})

Deno.test('source: ingen Time Engine eller staff_day_report_cache', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  for (const forbidden of ['processGpsTimelineForAutoStart', 'staff_day_report_cache', 'ACTIVE_CONTEXT_LOOKBACK_MS']) {
    if (src.includes(forbidden)) {
      throw new Error(`gps-heartbeat-pulse får inte innehålla ${forbidden}`)
    }
  }
})

// Kontraktstest: device_tokens-kolumnen heter last_refreshed_at, INTE refreshed_at.
// Felaktigt kolumnnamn kraschade hela pulse-cronet i prod 2026-06 och stoppade
// alla GPS-uppladdningar — får aldrig återkomma.
Deno.test('source: device_tokens-queryn använder last_refreshed_at, inte refreshed_at', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  if (/\brefreshed_at\b/.test(src) && !/last_refreshed_at/.test(src)) {
    throw new Error('gps-heartbeat-pulse refererar refreshed_at men inte last_refreshed_at')
  }
  // Hård spärr: rena "refreshed_at"-referenser (utan last_-prefix) får inte finnas
  const stripped = src.replace(/last_refreshed_at/g, '')
  if (/\brefreshed_at\b/.test(stripped)) {
    throw new Error('gps-heartbeat-pulse innehåller fortfarande referenser till device_tokens.refreshed_at (kolumnen heter last_refreshed_at)')
  }
  if (!src.includes('last_refreshed_at')) {
    throw new Error('gps-heartbeat-pulse måste läsa device_tokens.last_refreshed_at')
  }
})

Deno.test('token utan last ping → kandidat (oavsett aktiv timer)', () => {
  const t = [{ id: 't1', staff_id: 's1', token: 'x', platform: 'ios', organization_id: 'o1' }]
  const out = pickPulseCandidates(t as any, new Map(), NOW, 30)
  assertEquals(out.length, 1)
})

Deno.test('token med stale last ping (>30 min) → kandidat', () => {
  const t = [{ id: 't1', staff_id: 's1', token: 'x', platform: 'ios', organization_id: 'o1' }]
  const last = new Map<string, string | null>([['s1', '2026-05-25T11:00:00.000Z']]) // 60 min sedan
  const out = pickPulseCandidates(t as any, last, NOW, 30)
  assertEquals(out.length, 1)
})

Deno.test('token med färsk last ping (<30 min) → ej kandidat', () => {
  const t = [{ id: 't1', staff_id: 's1', token: 'x', platform: 'ios', organization_id: 'o1' }]
  const last = new Map<string, string | null>([['s1', '2026-05-25T11:45:00.000Z']]) // 15 min sedan
  const out = pickPulseCandidates(t as any, last, NOW, 30)
  assertEquals(out.length, 0)
})

