

## Plan: Visa "Signera"-knapp när allt är checkat

### Vad händer
När alla produkter är fullständigt packade (progress = 100%) visas en "Signera"-knapp fixerad längst ner på skärmen.

### Ändringar i `src/components/scanner/ManualChecklistView.tsx`

1. **Lägg till en "Signera"-knapp** längst ner i komponenten (innanför yttersta `<div>`), som bara renderas när `progress?.percentage === 100`.

2. **Knappen blir sticky/fixed** längst ner med tydlig grön styling så den syns direkt när allt är klart.

3. **Klick-hantering**: Knappen visar en toast eller triggar en signeringslogik (till att börja med en placeholder `toast.success('Signering klar!')`).

```text
┌──────────────────────────┐
│  Produkt A        1/1  ✓ │
│  Produkt B        2/2  ✓ │
│  Produkt C        1/1  ✓ │
│                          │
│                          │
├──────────────────────────┤
│     [ ✍ Signera ]        │  ← Visas bara vid 100%
└──────────────────────────┘
```

### Teknisk detalj
- Kontroll: `progress?.percentage === 100`
- Placering: Sticky bottom med padding och skugga
- Styling: Full-width grön knapp med ikon

