import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockEditDialog from '../BlockEditDialog';
import type { DisplayTimelineV2Block } from '@/hooks/useDisplayTimelineV2';

function makeBlock(): DisplayTimelineV2Block {
  // 2026-05-22 08:00 → 12:00 lokal
  const start = new Date(2026, 4, 22, 8, 0, 0).toISOString();
  const end = new Date(2026, 4, 22, 12, 0, 0).toISOString();
  return {
    id: 'b1',
    startAt: start,
    endAt: end,
    title: 'Test-block',
    label: 'Projekt X',
    displayType: 'project_work',
    allocationType: 'project_work',
    targetType: 'project',
    targetId: 'p1',
    durationMin: 240,
  } as any;
}

describe('BlockEditDialog – confirm step', () => {
  it('Fortsätt disabled tills något ändras', () => {
    render(<BlockEditDialog block={makeBlock()} date="2026-05-22" onClose={() => {}} onSave={() => {}} />);
    const next = screen.getByTestId('block-edit-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('> 60 min ändring kräver kommentar ≥ 10 tecken', () => {
    render(<BlockEditDialog block={makeBlock()} date="2026-05-22" onClose={() => {}} onSave={() => {}} />);
    // Ändra start från 08:00 till 06:00 (120 min delta)
    const startInput = screen.getAllByDisplayValue('08:00')[0];
    fireEvent.change(startInput, { target: { value: '06:00' } });
    const next = screen.getByTestId('block-edit-next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    const textarea = screen.getByPlaceholderText(/Skriv kort varför du ändrar/);
    fireEvent.change(textarea, { target: { value: 'Glömde stämpla' } });
    expect(next.disabled).toBe(false);
  });

  it('liten ändring (< 60 min) kräver ingen kommentar och visar diff på confirm-steget', () => {
    const onSave = vi.fn();
    render(<BlockEditDialog block={makeBlock()} date="2026-05-22" onClose={() => {}} onSave={onSave} />);
    const startInput = screen.getAllByDisplayValue('08:00')[0];
    fireEvent.change(startInput, { target: { value: '08:30' } });
    const next = screen.getByTestId('block-edit-next') as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    // Diff syns
    expect(screen.getByText(/Är du säker/)).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByText('08:30')).toBeTruthy();
    fireEvent.click(screen.getByTestId('block-edit-confirm'));
    expect(onSave).toHaveBeenCalled();
    const edits = onSave.mock.calls[0][0];
    expect(edits.length).toBeGreaterThan(0);
    expect(edits[0].editType).toBe('change_block_start');
  });
});
