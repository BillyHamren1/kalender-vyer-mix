

## Problem

`src/index.css` har `@import './styles/theme.css'` **efter** `@tailwind`-direktiven. CSS-specen kräver att `@import` kommer först. Vite varnar i dev men i produktion (det iOS-appen kör) kan det bryta hela stylesheet-parsningen → vit skärm.

Dessutom har `src/styles/theme.css` en nästlad `@import './calendar.css'` som också bryter mot regeln.

## Fix

### 1. `src/index.css` — flytta imports till toppen

```css
@import './styles/theme.css';
@import './styles/calendar.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* ... alla variabler oförändrade ... */
```

### 2. `src/styles/theme.css` — ta bort nästlad import

Ta bort raden `@import './calendar.css';` (rad 13). Den flyttas till `index.css` ovan.

### Inga andra ändringar

All CSS-innehåll, variabler, shadows — allt behålls exakt som det är. Bara ordningen på `@import` ändras.

### Efter detta

Du behöver pulla och bygga om:
1. `git pull`
2. `node scripts/build-ios.js time` / `node scripts/build-ios.js scanner`
3. Kör i Xcode

