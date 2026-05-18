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

  it('blockerar inte vertikal wheel i veckovyn när dagsinnehållet kan scrolla', () => {
    const { container } = render(<CustomCalendar {...baseProps} />);
    const weeklyGrid = container.querySelector('.weekly-horizontal-grid') as HTMLDivElement;
    const verticalScrollContainer = container.querySelector('[data-weekly-vertical-scroll="true"]') as HTMLDivElement;

    expect(weeklyGrid).toBeTruthy();
    expect(verticalScrollContainer).toBeTruthy();

    Object.defineProperty(verticalScrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(verticalScrollContainer, 'scrollHeight', { configurable: true, value: 1200 });
    Object.defineProperty(verticalScrollContainer, 'scrollTop', { configurable: true, value: 120 });

    const preventDefault = vi.fn();
    const wheelEvent = new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true });
    Object.defineProperty(wheelEvent, 'preventDefault', { configurable: true, value: preventDefault });

    verticalScrollContainer.dispatchEvent(wheelEvent);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});