
## Modern Personalvisning - Alla Synliga, Clean Design

### Problem
- Personal renderas med gammaldags klumpiga boxar (`p-2 border border-gray-200 rounded-md`)
- Staff-raden har fast höjd (60px) som gör att det blir trångt
- Wrapping av badges ser kladdigt ut när det blir många

### Lösning: Dynamisk Höjd + Moderna Pills

#### Designprinciper
- **Visa ALL personal** - ingen dold information
- **Moderna pill-badges** - rounded-full, mindre padding, subtila shadows
- **Dynamisk höjd** - raden växer efter behov istället för fast höjd
- **Bättre layout** - jämn grid/flex med konsekvent spacing
- **Subtil hover-effekt** - X-knapp visas bara vid hover per badge

---

### Visuell förändring

**Före:**
```
┌─────────────────────────────────────┐
│ 6 staff                             │
│ ┌────────┐ ┌────────┐ ┌────────┐   │  ← Klumpiga boxar med borders
│ │ Billy  │ │ Joel   │ │ Andris │   │
│ └────────┘ └────────┘ └────────┘   │
│ ┌────────┐ ┌────────┐ ┌────────┐   │  ← Trångt, fult
│ │ Lisa   │ │ Erik   │ │ Maria  │   │
│ └────────┘ └────────┘ └────────┘   │
└─────────────────────────────────────┘
```

**Efter:**
```
┌───────────────────────────────────────────────────┐
│  Billy   Joel   Andris   Lisa   Erik   Maria      │  ← Eleganta pills på en/flera rader
│                                                   │     Raden växer efter behov
└───────────────────────────────────────────────────┘
```

---

### Tekniska ändringar

#### 1. StaffAssignmentArea.tsx
- Byt från `variant="assigned"` till `variant="compact"` för att få moderna pill-badges

#### 2. TimeGrid.css - Staff Assignment Row
- Ta bort `height: 60px` → `min-height: 50px` med `height: auto`
- Ta bort `max-height: 54px` på staff-listan
- Låt raden växa dynamiskt baserat på innehåll
- Uppdatera padding och gap för bättre spacing

#### 3. StaffItem.tsx - Finjustera compact variant
- Minska padding till `px-2.5 py-0.5` för tightare pills
- Använd `text-[11px]` för lite mindre text
- Behåll moderna hover-effekter och X-knapp

---

### Sammanfattning av filer som ändras

| Fil | Ändring |
|-----|---------|
| `StaffAssignmentArea.tsx` | Byt till `variant="compact"` |
| `TimeGrid.css` | Dynamisk höjd, ta bort max-height |
| `StaffItem.tsx` | Mindre/tightare pill-design |
