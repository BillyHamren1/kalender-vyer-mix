// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import CustomCalendar from '../CustomCalendar';

vi.mock('@/hooks/useWeekDays', () => ({
  useWeekDays: (currentDate: Date) => [currentDate],
}));

vi.mock('@/hooks/useCarouselState', () => ({
  useCarouselState: () => ({
    centerIndex: 0,
    setCenterIndex: vi.fn(),
    getPositionFromCenter: () => 0,
    navigateCarousel: vi.fn(),
    handleDayCardClick: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAvailableStaffWeek', () => ({
  useAvailableStaffWeek: () => ({
    getAvailableStaffForDay: () => [],
  }),
}));

vi.mock('@/hooks/useMemoizedEvents', () => ({
  useStableEvents: <T,>(events: T[]) => events,
}));

vi.mock('@/hooks/useEventDragDrop', () => ({
  useEventDragDrop: () => ({
    isDragging: false,
    dragOverDate: null,
    isMoving: false,
    handleDragOver: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEventNavigation', () => ({
  useEventNavigation: () => ({
    handleEventClick: vi.fn(),
  }),
}));

vi.mock('../TeamVisibilityControl', () => ({
  default: () => null,
}));

vi.mock('../TeamStaffPickerPopover', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../StaffItem', () => ({
  default: () => null,
}));

vi.mock('../TimeGridEventLayer', () => ({
  EventWrapper: () => null,
  SimpleTimeSlot: () => null,
}));

const baseProps = {
  events: [],
  resources: [],
  isLoading: false,
  isMounted: true,
  currentDate: new Date('2026-05-18T08:00:00.000Z'),
  onDateSet: vi.fn(),
  refreshEvents: vi.fn().mockResolvedValue(undefined),
  viewMode: 'weekly' as const,
};

describe('CustomCalendar hook stability', () => {
  it('klarar loading → loaded utan hook-ordningsfel', () => {
    const { rerender } = render(
      <CustomCalendar
        {...baseProps}
        isLoading={true}
        isMounted={false}
      />,
    );

    expect(() => {
      rerender(
        <CustomCalendar
          {...baseProps}
          isLoading={false}
          isMounted={true}
        />,
      );
    }).not.toThrow();
  });
});