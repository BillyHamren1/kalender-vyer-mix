import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRANSPORT_TODO_TITLE,
  isTransportTodoTitle,
} from '@/components/project/defaultChecklist';

describe('default project todo', () => {
  it('har "Boka transport" som enda defaultpunkt', () => {
    expect(DEFAULT_TRANSPORT_TODO_TITLE).toBe('Boka transport');
  });

  it('matchar både nya och historiska transporttiteln', () => {
    expect(isTransportTodoTitle('Boka transport')).toBe(true);
    expect(isTransportTodoTitle('Transportbokning')).toBe(true);
    expect(isTransportTodoTitle(' Boka transport ')).toBe(true);
  });

  it('matchar inte andra uppgifter', () => {
    expect(isTransportTodoTitle('Personalplanering')).toBe(false);
    expect(isTransportTodoTitle('')).toBe(false);
    expect(isTransportTodoTitle(null)).toBe(false);
  });

  it('exporterar ingen standardchecklista längre', async () => {
    const mod = await import('@/components/project/defaultChecklist');
    expect((mod as Record<string, unknown>).DEFAULT_CHECKLIST).toBeUndefined();
  });
});
