import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BreakRequiredDialog from '../BreakRequiredDialog';

describe('BreakRequiredDialog', () => {
  it('confirm-knappen är disabled utan val', () => {
    render(
      <BreakRequiredDialog
        open
        passHours={6.5}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    const btn = screen.getByTestId('break-confirm') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('preset-val aktiverar confirm och returnerar valda minuter', () => {
    const onConfirm = vi.fn();
    render(
      <BreakRequiredDialog
        open
        passHours={6.5}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('30 min'));
    const btn = screen.getByTestId('break-confirm') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith({ breakMinutes: 30, comment: null });
  });

  it('"Ingen rast" kräver kommentar ≥ 10 tecken', () => {
    const onConfirm = vi.fn();
    render(
      <BreakRequiredDialog
        open
        passHours={6.5}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Ingen rast'));
    const btn = screen.getByTestId('break-confirm') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const textarea = screen.getByPlaceholderText(/Varför togs ingen rast/);
    fireEvent.change(textarea, { target: { value: 'kort' } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: 'Glömde rast helt idag, mycket att göra' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith({
      breakMinutes: 0,
      comment: 'Glömde rast helt idag, mycket att göra',
    });
  });

  it('custom mode kräver positivt heltal', () => {
    const onConfirm = vi.fn();
    render(
      <BreakRequiredDialog
        open
        passHours={6}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Annat'));
    const btn = screen.getByTestId('break-confirm') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const input = screen.getByPlaceholderText(/t.ex. 25/);
    fireEvent.change(input, { target: { value: '25' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith({ breakMinutes: 25, comment: null });
  });
});
