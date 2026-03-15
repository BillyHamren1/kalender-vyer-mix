

## Sidebar Style Cleanup — Cleaner & Clearer

Based on the reference screenshot, the sidebar needs a cleaner, more spacious look with crisper typography and less visual noise.

### What changes

**`src/components/Sidebar3D.tsx`**:

1. **Typography**: Bump nav item text from `text-[13px]` to `text-[15px]`, sub-items to `text-[14px]`. More readable, matches reference.

2. **Spacing**: Increase `space-y-px` → `space-y-1`, and item padding from `py-[9px]` → `py-3`. Sub-items get `py-2.5`. Overall more breathing room.

3. **Icon sizing**: Icons from `w-[14px] h-[14px]` → `w-5 h-5` (container `w-5 h-5`). Clearer at a glance.

4. **Active state**: Simplify — remove the left border indicator. Use subtle `bg-accent` background only. Less visual clutter.

5. **Inactive text**: Change from `text-foreground/[0.72]` → `text-foreground/80` for better contrast/readability.

6. **Chevron button**: Style the expand chevron as a small bordered square button (`border rounded p-1 hover:bg-muted/50`) matching the reference screenshot's chevron style.

7. **Sub-items indentation**: Cleaner vertical line — use `border-border/30` instead of `/40`, and slightly more left margin.

8. **Sidebar width**: Expand from `w-48` → `w-56` to give items more room (matches the spacious feel in the reference).

9. **Separator line**: Lighten the right edge from `hsl(200 18% 66%)` → `hsl(200 15% 85%)` for subtlety.

10. **Collapse button**: Soften shadow, use `border border-border` instead of `border-2 border-primary` for a less aggressive look.

### Files to edit
- `src/components/Sidebar3D.tsx` — all style changes above
- `src/components/layouts/MainSystemLayout.tsx` — no changes needed

