## Mål
Förbättra renderingen av Gantt-vyn i `src/components/staff/StaffGanttView.tsx` enligt tre punkter. Ingen logik/data ändras — enbart presentation.

## Ändringar

### 1. Tid-axeln överst — bara timmar
Rad ~1748–1766 i `StaffGanttView.tsx`. Headern visar idag varje timme som två rader: `09` + `:00`. Det wrappar och ser trasigt ut (se uppladdad bild).

**Åtgärd:** Ta bort `:00`-spannet och visa endast `09`, `10`, `11`… på en rad. Höjden på headern kan minskas (från `height: 52` → `height: 32`).

### 2. Ta bort datum efter kundnamn i blocket
Bloktitlar som `Westmans Uthyrning - 23 maj 2026` ska visas som `Westmans Uthyrning`.

**Åtgärd:** I `blockDisplayTitle` (rad ~212) lägg till regex-strip av trailing ` - <DD MMM YYYY>` / ` - <YYYY-MM-DD>`-mönster på svenska månader (jan, feb, mar, apr, maj, jun, jul, aug, sep, okt, nov, dec) innan return. Påverkar bara presentation i Gantt; modalens fulltitel rörs ej.

### 3. Badge på egen rad + tajtare layout
Idag (rad ~2135–2158): badge (RIGG/TRANSPORT) ligger på samma rad som titeln med `flex items-center gap-1.5` → titeln trunkeras direkt och försvinner (`Westmans Uthyrn…`).

**Åtgärd:** Stapla vertikalt:
```
[ RIGG ]              ← rad 1 (badge själv, shrink-fit)
Westmans Uthyrning    ← rad 2 (titel, kan trunkera)
13:08–20:32 · 7h 24m  ← rad 3 (tid+duration, visas när det får plats)
```

Konkret:
- Wrappa innehållet i `<div className="flex flex-col gap-0.5">`.
- Badge-spannet får `self-start` så det inte sträcker sig.
- Minska padding: `isNarrow ? 'px-1 py-0.5' : 'px-2 py-1'` (var `px-2.5 py-1.5`).
- Sänk `showLabel`-tröskeln till `width >= 50` så titeln visas i smala block.
- `showTime` får ny tröskel baserad på `laneHeight >= 54` (eftersom badge nu tar en egen rad).
- Truncate-klass `truncate` kvar på titel; `min-w-0` på flex-containern för korrekt clip.

## Tekniska detaljer
- Fil: `src/components/staff/StaffGanttView.tsx` (3 redigeringar)
- Inga ändringar i data/pipelines/edge functions/tester.
- `fmtMin` (timmar+minuter, t.ex. `7h 24m`) bibehålls i bloken — användarens "skriv timmar bara" gäller tim-axeln överst, inte durations i blocken.

## Verifiering
- Bygget körs automatiskt.
- Visuell QA i preview på `/staff-management/time-reports` (1371×931).
