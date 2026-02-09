

# Bokningslista och filter synliga direkt

## Problem
Transportwidgeten med bokningslista och datumfilter hamnar **under kartan** och syns inte utan att scrolla. Hela kartan tar upp skärmen.

## Losning
Flytta bokningslistan och filtren till **hogerkolumnen** sa att de syns direkt bredvid kartan, utan att behova scrolla.

## Layout-forandring

Nuvarande:
```text
+---------------------------+----------+
|                           | Kalender |
|        KARTA              | Vader    |
|                           | Trafik   |
+---------------------------+----------+
| Transportbokningar (dolda under fold)|
+--------------------------------------+
```

Nytt:
```text
+---------------------------+----------+
|                           | Kalender |
|        KARTA              | Transport|
|                           | boknings-|
|                           | lista    |
+---------------------------+----------+
```

## Tekniska detaljer

### Fil: `src/pages/LogisticsPlanning.tsx`

1. **Flytta `LogisticsTransportWidget`** fran under grid-layouten till hogerkolumnen, efter kalender-widgeten
2. **Ta bort** vader- och trafikwidgetarna fran hogerkolumnen (de tar plats fran bokningslistan)
3. **Ge transportwidgeten `flex-1`** sa den fyller resterande hogerkolumn-hoijd
4. Behall expanded-dialog for transport och karta

### Fil: `src/components/logistics/widgets/LogisticsTransportWidget.tsx`

1. **Ta bort `max-h-[280px]`** pa bokningslistan sa den kan vaxa och fylla tillgangligt utrymme
2. Gor listan `flex-1 overflow-y-auto` istallet for fast hojd
3. Gora hela kortet till `flex flex-col h-full` sa det fyller sin container

Vader och trafik kan man lagga tillbaka som expanderbara widgets i framtiden om det behovs.
