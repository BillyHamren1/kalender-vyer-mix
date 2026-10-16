import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Button } from './button';

describe('shared action behavior', () => {
  it('invokes the action once for a click', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<Button onClick={onClick}>Spara</Button>);
    fireEvent.click(getByRole('button', { name: 'Spara' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    cleanup();
  });
  it('does not invoke a disabled action', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<Button disabled onClick={onClick}>Spara</Button>);
    fireEvent.click(getByRole('button', { name: 'Spara' }));
    expect(onClick).not.toHaveBeenCalled();
    cleanup();
  });
  it('preserves navigation when rendered as a link', () => {
    const { getByRole } = render(<Button asChild><a href="/warehouse">Lager</a></Button>);
    expect(getByRole('link', { name: 'Lager' }).getAttribute('href')).toBe('/warehouse');
    cleanup();
  });
});