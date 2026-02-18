
## Mål
Omvandla uppgiftslistan till en modern, Todoist-inspirerad upplevelse — rik interaktivitet, inline-redigering, snabbkommentarer och tydlig visuell hierarki.

## Vad som saknas idag
- Klicka på en uppgift → öppnar ett Sheet, men det är klumpigt och kräver för många steg
- Ingen inline-redigering av titel direkt i listan
- Kommentarsfältet kräver att man skriver in sitt namn varje gång (dålig UX)
- Ingen möjlighet att snabbt lägga till en uppgift utan att öppna dialog
- Reorder-knapparna tar upp onödig plats och är svåra att använda
- TaskDetailSheet saknar sub-tasks / checklistor

## Plan

### 1. `src/components/project/TaskDetailSheet.tsx` — Komplett omdesign
Förvandla till en rik Todoist-liknande sidopanel:

**Header-sektion:**
- Stor, klickbar titel med inline-redigering (klicka → textruta)
- Status-chip (klar/ej klar) med checkmark
- Stäng-knapp (X) tydlig

**Detaljer-sektion (kompakt rad-layout):**
- Deadline: klicka → date picker inline
- Ansvarig: klicka → dropdown inline
- Prioritet: (kan läggas till senare)

**Kommentars-sektion (förbättrad):**
- Ta bort "Ditt namn"-fältet — istället ett persistent namn-state i localStorage (kom ihåg senaste namn)
- Kommentarer visas i tidslinje-stil med avatar, namn, tid
- Enkel textarea + Enter = skicka (eller Shift+Enter för ny rad)

**Åtgärder (botten):**
- Ta bort-knapp (röd, diskret)

### 2. `src/components/project/ProjectTaskItem.tsx` — Inline-redigering
- Dubbelklick på titel → inline edit (ersätter span med input)
- Swipe-to-delete / hover-trash behålls
- Lägg till en prioritetsindikator-prick (valfritt färgat)
- Drag-handle (≡) ersätter ChevronUp/Down-knapparna

### 3. `src/components/project/ProjectTaskList.tsx` — Snabb-tillägg
- Lägg till ett "Lägg till uppgift..."-fält direkt i botten av listan (ingen dialog)
- Skriv titel + Enter → uppgift läggs till direkt
- Behåll + knappen för full dialog (med deadline, ansvarig etc.)

### 4. `src/components/project/AddTaskDialog.tsx` — Förenkling
- Befintlig dialog behålls men "snabb-lägg-till" i listan prioriteras

## Tekniska detaljer

### localStorage för kommentar-namn
```tsx
const [authorName, setAuthorName] = useState(() => 
  localStorage.getItem('task-comment-author') || ""
);
// Vid submit: localStorage.setItem('task-comment-author', authorName)
```

### Inline quick-add i listan
```tsx
<div className="flex items-center gap-2 px-2 py-1.5 border-t border-border/20">
  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
  <input
    placeholder="Lägg till uppgift..."
    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
    className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
  />
</div>
```

### Drag-handle istället för pilar
Ersätt ChevronUp/Down med en `GripVertical`-ikon (≡) som är mer intuitiv och tar mindre plats.

## Filer att ändra
| Fil | Ändring |
|---|---|
| `src/components/project/TaskDetailSheet.tsx` | Komplett Todoist-redesign av sidopanelen |
| `src/components/project/ProjectTaskItem.tsx` | Inline-redigering + drag-handle |
| `src/components/project/ProjectTaskList.tsx` | Snabb-tillägg i botten av listan |

## Resultat
En snabb, modern och funktionell uppgiftshanterare som känns lika naturlig som Todoist — med stöd för kommentarer, redigering, snabb-tillägg och tydlig hierarki.
