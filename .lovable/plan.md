

## Plan: Retroaktiv synk av alla projekt

### Åtgärd

Kör en INSERT som täcker **alla** stora projekt — inte bara Swedish Game Fair. Queryn hittar alla personal som har BSA-rader mot bokningar i något stort projekt men saknas i `large_project_staff`, och lägger till dem.

### SQL som körs (via insert-verktyget)

```sql
INSERT INTO public.large_project_staff (large_project_id, staff_id, organization_id, role)
SELECT DISTINCT lpb.large_project_id, bsa.staff_id, lpb.organization_id, 'field'
FROM public.booking_staff_assignments bsa
JOIN public.large_project_bookings lpb ON lpb.booking_id = bsa.booking_id
ON CONFLICT (large_project_id, staff_id) DO NOTHING;
```

### Nuläge

- 1 person behöver synkas (Swedish Game Fair)
- Övriga 5 projekt har inga BSA-rader ännu — men queryn är generell och hanterar alla

### Filer som ändras

Inga — enbart en datainsert. Triggern från förra steget hanterar alla framtida tilldelningar.

