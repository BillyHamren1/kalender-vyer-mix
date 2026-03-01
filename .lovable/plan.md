

## Plan: Sök och filter på projektsidan

### Nuläge
- Projektsidan har tre separata paneler (litet, medel, stort) med individuella sökfält
- Avslutade projekt gömda i separat arkivsida (`/projects/archive`)
- Inget sätt att söka över alla projekttyper samtidigt

### Vad som ska byggas

**Global sökrad** högst upp på projektsidan (ovanför de tre kolumnerna) med:
1. Ett gemensamt sökfält som filtrerar alla tre paneler samtidigt
2. En statusfilter-dropdown (Alla aktiva / Planering / Pågående / Avslutad / Alla inkl. gamla)
3. När "Alla inkl. gamla" väljs — visas även completed-projekt i respektive panel

### Teknisk approach

1. **`ProjectManagement.tsx`** — Lägg till state för `globalSearch` och `globalStatusFilter`. Skicka dessa som props till alla tre list-paneler.

2. **`JobsListPanel.tsx`**, **`MediumProjectsListPanel.tsx`**, **`LargeProjectsListPanel.tsx`** — Ta emot `externalSearch` och `externalStatusFilter` props. När dessa finns, dölj panelens egna sök/filter och använd de globala istället. Uppdatera filtreringslogiken så att `completed`-projekt inkluderas om filtret tillåter det (istället för att alltid dölja dem).

3. **Arkivknappen behålls** men den globala söken ger samma funktion snabbare.

### Ändringar

| Fil | Ändring |
|---|---|
| `src/pages/ProjectManagement.tsx` | Lägg till global sökrad med Input + Select ovanför grid |
| `src/components/project/JobsListPanel.tsx` | Acceptera `externalSearch`/`externalStatusFilter` props, inkludera completed i filter |
| `src/components/project/MediumProjectsListPanel.tsx` | Samma som ovan |
| `src/components/project/LargeProjectsListPanel.tsx` | Samma som ovan |

