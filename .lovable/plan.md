

## Plan: Fixa native-appstart till scanner

### Rotorsak
`src/main.tsx` redirectar alla Capacitor-starter till `/m/login` innan React mountas. Scanner-routen (`/scanner`) finns men nås aldrig.

### Ändring — `src/main.tsx`

Rad 12-13 ändras från:
```typescript
if (isNative && !window.location.pathname.startsWith('/m')) {
  window.location.pathname = '/m/login';
```

Till:
```typescript
if (isNative && !window.location.pathname.startsWith('/scanner')) {
  window.location.pathname = '/scanner';
```

**En fil, två rader.** Scanner-routen är redan unprotected i App.tsx (rad 185).

