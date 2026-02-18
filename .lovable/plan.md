
## Mål
Placera sektionerna "Kommentarer" och "Historik" bredvid varandra i en 50/50-layout i `ProjectViewPage.tsx`.

## Ändring

### `src/pages/project/ProjectViewPage.tsx`
Wrap de två `<section>`-blocken (Kommentarer + Historik) i ett gemensamt grid:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
  <section>
    <SectionHeader icon={MessageSquare} title="Kommentarer" count={comments.length} />
    <ProjectComments comments={comments} onAddComment={detail.addComment} />
  </section>

  <section>
    <SectionHeader icon={History} title="Historik" count={activities.length} />
    <ProjectActivityLog activities={activities} />
  </section>
</div>
```

"Filer" och "Transport" förblir i full bredd ovanför.

## Fil att ändra
| Fil | Ändring |
|---|---|
| `src/pages/project/ProjectViewPage.tsx` | Wrap Kommentarer + Historik i `grid grid-cols-1 lg:grid-cols-2` |
