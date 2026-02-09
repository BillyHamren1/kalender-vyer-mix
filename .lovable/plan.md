

## Fix: Byt plats på färgerna — vit bakgrund på kolumner, färgade kort

### Problemet
Just nu är färgerna på FEL ställe:
- Kolumnerna har färgad bakgrund (gul, röd, grön) -- ska vara VITA
- Korten har vit bakgrund -- ska vara FÄRGADE

Det ska vara TVÄRTOM, precis som i referensbilden.

### Ändringar

**Fil: `src/components/logistics/widgets/LogisticsTransportWidget.tsx`**

**1. Kolumnbakgrunder (rad 242-267) -- gör VITA:**
- "Atgard kravs": `bgColor` andras fran `bg-destructive/5` till `bg-white`
- "Vantar svar": `bgColor` andras fran `bg-amber-500/5` till `bg-white`
- "Bekraftat": `bgColor` andras fran `bg-primary/5` till `bg-white`
- Alla `borderColor` andras till `border-border/40` (neutral tunn kant)

**2. Kort-bakgrund (rad 73-74) -- gor FARGADE baserat pa status:**

Kortet (TransportCard) far en fargad bakgrund beroende pa vilken kolumn det tillhor. For att gora detta skickas en extra prop (`cardColor`) fran kolumnen till TransportCard:

- "Atgard kravs"-kort: `bg-red-50 border-red-200`
- "Vantar svar"-kort: `bg-amber-50 border-amber-200`
- "Bekraftat"-kort: `bg-teal-50 border-teal-200`

### Teknisk implementering

1. Lagg till `cardBg` och `cardBorder` i kolumn-arrayen:
```text
columns = [
  { title: 'Atgard kravs',  bgColor: 'bg-white', borderColor: 'border-border/40', cardBg: 'bg-red-50',   cardBorder: 'border-red-200'   },
  { title: 'Vantar svar',   bgColor: 'bg-white', borderColor: 'border-border/40', cardBg: 'bg-amber-50', cardBorder: 'border-amber-200' },
  { title: 'Bekraftat',     bgColor: 'bg-white', borderColor: 'border-border/40', cardBg: 'bg-teal-50',  cardBorder: 'border-teal-200'  },
]
```

2. Skicka `cardBg` och `cardBorder` som props till TransportCard-komponenten.

3. I TransportCard, byt `bg-card border-border/40` pa rad 74 till de motagna props-vardena.

### Resultat
- Kolumner: vita med tunn neutral kant
- Kort: fargade (gult for "Vantar", rott for "Atgard kravs", gront for "Bekraftat")
- Exakt som referensbilden

