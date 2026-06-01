import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StaffTimeAndPayrollPage from '@/pages/StaffTimeAndPayrollPage';

vi.mock('@/components/staff-time/StaffTimeWeeklyGpsReportContent', () => ({
  default: () => <div data-testid="tid-content">TID_VIEW</div>,
}));
vi.mock('@/components/staff-time/StaffTimeReportsContent', () => ({
  default: () => <div data-testid="lon-content">LON_VIEW</div>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/staff-management/time" element={<StaffTimeAndPayrollPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StaffTimeAndPayrollPage tabbar', () => {
  it('renderar Tid- och Lön-tabbar', () => {
    renderAt('/staff-management/time');
    expect(screen.getByRole('tab', { name: 'Tid' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Lön' })).toBeInTheDocument();
  });

  it('default = Tid-tabb (veckomatrisen syns)', () => {
    renderAt('/staff-management/time');
    expect(screen.getByTestId('tid-content')).toBeInTheDocument();
  });

  it('?tab=lon aktiverar Lön-tabben direkt', () => {
    renderAt('/staff-management/time?tab=lon');
    expect(screen.getByTestId('lon-content')).toBeInTheDocument();
  });

  it('klick på Lön visar tidrapport-innehållet', async () => {
    const user = userEvent.setup();
    renderAt('/staff-management/time');
    await user.click(screen.getByRole('tab', { name: 'Lön' }));
    expect(screen.getByTestId('lon-content')).toBeInTheDocument();
  });
});
