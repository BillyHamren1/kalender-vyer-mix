import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('EventFlow shared design standard 2026-10-18', () => {
  it('locks the shared teal action tokens (#1F747A / #156065)', () => {
    const css = read('src/index.css');
    expect(css).toContain('--action: 184 59% 30%'); /* #1F747A */
    expect(css).toContain('--action-end: 184 66% 24%'); /* #156065 */
    expect(css).not.toContain('188 54% 17%'); /* gammal petrol #143F46 */
    expect(css).not.toContain('189 57% 11%'); /* gammal petrol #0D2A2F */
  });

  it('locks neutral near-black text and grey secondary text', () => {
    const css = read('src/index.css');
    expect(css).toContain('--foreground: 210 5% 13%'); /* #202223 */
    expect(css).toContain('--heading: 210 5% 13%');
    expect(css).toContain('--muted-foreground: 210 4% 40%'); /* #62666A */
    const planning = read('src/styles/planning.css');
    expect(planning).toContain('--foreground: 210 5% 13%');
    expect(planning).toContain('--muted-foreground: 210 4% 40%');
  });

  it('locks the exact white sidebar and light canvas', () => {
    const css = read('src/index.css');
    expect(css).toContain('--sidebar-background: 0 0% 100%');
    expect(css).toContain('--background: 200 20% 94.1176%'); /* #EDF1F3 */
  });

  it('keeps form fields pure white against the canvas', () => {
    for (const f of ['src/components/ui/input.tsx', 'src/components/ui/textarea.tsx', 'src/components/ui/select.tsx']) {
      const src = read(f);
      expect(src, f).toContain('bg-card');
      expect(src, f).not.toContain('bg-background px-3');
    }
  });

  it('keeps the module identity tile free of glow and 3D effects', () => {
    const planning = read('src/styles/planning.css');
    expect(planning).not.toContain('drop-shadow');
    expect(planning).not.toContain('radial-gradient(circle at 28%');
  });

  it('documents the standard and links it from AGENTS.md', () => {
    const doc = read('docs/design/EVENTFLOW-DESIGN-STANDARD.md');
    expect(doc).toContain('#1F747A');
    expect(doc).toContain('#202223');
    expect(read('AGENTS.md')).toContain('docs/design/EVENTFLOW-DESIGN-STANDARD.md');
  });
});
