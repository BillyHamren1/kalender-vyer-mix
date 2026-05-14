import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Smoke-test: verifierar att route + filer existerar och är registrerade.
 * Full integrationstest skippas pga PDF/canvas-deps i CustomCalendar-trädet.
 */
describe('Personalkalendern — registrering', () => {
  const root = path.resolve(__dirname, '..', '..');

  it('PersonalkalendernPage finns', () => {
    expect(fs.existsSync(path.join(root, 'src/pages/PersonalkalendernPage.tsx'))).toBe(true);
  });

  it('PersonalkalendernLogin finns', () => {
    expect(fs.existsSync(path.join(root, 'src/pages/PersonalkalendernLogin.tsx'))).toBe(true);
  });

  it('AuthGate finns', () => {
    expect(fs.existsSync(path.join(root, 'src/auth/PersonalkalendernAuthGate.tsx'))).toBe(true);
  });

  it('App.tsx registrerar både routes', () => {
    const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/path="\/personalkalendern"/);
    expect(app).toMatch(/path="\/personalkalendern\/login"/);
  });

  it('Sidebar har länk', () => {
    const sb = fs.readFileSync(path.join(root, 'src/components/Sidebar3D.tsx'), 'utf8');
    expect(sb).toMatch(/Personalkalendern \(publik\)/);
    expect(sb).toMatch(/url: "\/personalkalendern"/);
  });
});
