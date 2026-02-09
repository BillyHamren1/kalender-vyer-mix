

# Tydligare navigering till "Boka transport"

## Problem
Tabbar ("Dashboard" / "Boka transport") ar for sma, diskreta och smaler in i bakgrunden. Det ar nast intill omojligt att se att det finns en "Boka transport"-funktion.

## Losning
Gora om navigeringen till stora, tydliga knappar med visuella indikatorer istallet for subtila tabbar.

### Vad som andras

**1. Stora, visuella navigationskort istallet for sma tabbar**
- Ersatter de sma TabsTrigger-elementen med tva tydliga, klickbara kort som tar upp hela bredden
- Varje kort far en ikon, tydlig rubrik, och en kort beskrivning
- "Boka transport"-kortet far dessutom en badge som visar antal obokadetransporter (t.ex. "3 väntar")

**2. Visuell design**
- Aktiv tab far en tydlig primary-fargad ram och bakgrund
- Inaktiv tab far en diskret stil men med tydlig hover-effekt
- Bada korten ar stora nog att de inte kan missas

### Visuellt resultat (ungefar)

```text
+---------------------------------------+---------------------------------------+
|  [truck-ikon]                         |  [clipboard-ikon]          [3 vantar] |
|  Dashboard                            |  Boka transport                       |
|  Oversikt av dagens leveranser        |  Tilldela fordon till bokningar       |
+---------------------------------------+---------------------------------------+
```

### Tekniska detaljer

**Fil: `src/pages/LogisticsPlanning.tsx`**

Andringen sker pa raderna 115-125 dar TabsList och TabsTrigger renderas. Istallet for den nuvarande kompakta TabsList:

```tsx
// Nuvarande (liten, diskret)
<TabsList className="rounded-xl h-11 bg-muted/50 p-1">
  <TabsTrigger ...>Dashboard</TabsTrigger>
  <TabsTrigger ...>Boka transport</TabsTrigger>
</TabsList>
```

Ersatts med:

```tsx
// Ny (stor, tydlig)
<TabsList className="w-full h-auto bg-transparent p-0 grid grid-cols-2 gap-4">
  <TabsTrigger value="dashboard" className="...large card styles...">
    <Truck icon />
    <h3>Dashboard</h3>
    <p>Oversikt av leveranser och fordon</p>
  </TabsTrigger>
  <TabsTrigger value="booking" className="...large card styles...">
    <ClipboardList icon />
    <h3>Boka transport</h3>
    <p>Tilldela fordon till bekraftade bokningar</p>
    <Badge>{antal} vantar</Badge>  <!-- visar antal utan transport -->
  </TabsTrigger>
</TabsList>
```

- Aktiv tab far: `border-primary bg-primary/5 shadow-lg`
- Inaktiv tab far: `border-border/40 bg-card hover:border-primary/30 hover:shadow-md`
- Badge pa "Boka transport" visar antal bokningar utan transport (kraver att `useBookingsForTransport` anropas i `LogisticsPlanning.tsx`)

**Fil: `src/hooks/useBookingsForTransport.ts`** (mindre andring)
- Exportera antal `withoutTransport` sa det kan anvandas i foraldern for badge-raknaren

