import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { uniqueChannelName } from '@/lib/realtime/channelName';

/**
 * Supabase Realtime kastar om samma kanalnamn prenumereras två gånger i samma
 * flik. Ett sådant kast slår ut hela sidan (GlobalErrorBoundary). Därför får
 * inga kanaler ha hårdkodade strängnamn.
 */

const ROOT = resolve(process.cwd(), 'src');
const LITERAL_CHANNEL = /\.channel\(\s*['"`][^'"`]+['"`]\s*\)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('realtime channel uniqueness contract', () => {
  it('uniqueChannelName never repeats a name', () => {
    const names = new Set<string>();
    for (let i = 0; i < 500; i++) names.add(uniqueChannelName('demo', 'org-1'));
    expect(names.size).toBe(500);
  });

  it('includes the tenant scope when given', () => {
    expect(uniqueChannelName('demo', 'org-1')).toContain('demo-org-1-');
  });

  it('no source file subscribes with a hardcoded channel name', () => {
    const offenders = walk(ROOT)
      .filter((file) => LITERAL_CHANNEL.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(offenders).toEqual([]);
  });
});
