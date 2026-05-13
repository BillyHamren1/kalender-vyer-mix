import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Contract: i mobilappen får filer/bilagor (file_url, receipt_url, attachment.url, file.url)
 * ALDRIG öppnas via <a target="_blank"> eller window.open() — det fungerar inte i iOS
 * Capacitor WKWebView. Allt ska gå genom openFileExternally som använder @capacitor/browser.
 */

const ROOTS = [
  'src/components/mobile-app',
  'src/pages/mobile',
];

const FILE_URL_TOKENS = [
  'file_url',
  'receipt_url',
  'attachment.url',
  'file.url',
  'img.url',
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

describe('mobile file opening contract', () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it('finds mobile source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('uses no <a target="_blank"> for storage URLs (file/receipt/attachment)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Heuristic: any <a ... href={...url-token...} ... target="_blank"> or with download=
      const aBlocks = src.match(/<a\b[\s\S]*?>/g) || [];
      for (const block of aBlocks) {
        if (!block.includes('target="_blank"') && !/download=/.test(block)) continue;
        if (FILE_URL_TOKENS.some((tok) => block.includes(tok))) {
          offenders.push(`${f}: ${block.replace(/\s+/g, ' ').slice(0, 140)}`);
        }
      }
    }
    expect(offenders, `Använd openFileExternally istället:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('uses no window.open() for file/receipt URLs', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const calls = src.match(/window\.open\([^)]*\)/g) || [];
      for (const call of calls) {
        if (FILE_URL_TOKENS.some((tok) => call.includes(tok))) {
          offenders.push(`${f}: ${call}`);
        }
      }
    }
    expect(offenders, `Använd openFileExternally istället:\n${offenders.join('\n')}`).toEqual([]);
  });
});
