import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';

/**
 * Manages 3D carousel state: center index, navigation, wheel scrolling.
 */
export const useCarouselState = (
  days: Date[],
  weekStartTime: number,
  containerRef: React.RefObject<HTMLDivElement>,
  isActive: boolean
) => {
  const getTodayIndex = useCallback(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const index = days.findIndex(d => format(d, 'yyyy-MM-dd') === todayStr);
    return index >= 0 ? index : 3;
  }, [days]);

  const [centerIndex, setCenterIndex] = useState(() => getTodayIndex());

  useEffect(() => {
    setCenterIndex(getTodayIndex());
  }, [weekStartTime, getTodayIndex]);

  const getPositionFromCenter = (index: number): number => {
    const totalDays = days.length;
    let diff = index - centerIndex;
    if (diff > totalDays / 2) diff -= totalDays;
    else if (diff < -totalDays / 2) diff += totalDays;
    return Math.max(-3, Math.min(3, diff));
  };

  const navigateCarousel = (direction: 'left' | 'right') => {
    setCenterIndex(prev => {
      if (direction === 'left') return prev === 0 ? days.length - 1 : prev - 1;
      return prev === days.length - 1 ? 0 : prev + 1;
    });
  };

  const handleDayCardClick = (index: number) => {
    if (index !== centerIndex) setCenterIndex(index);
  };

  // Wheel handling
  const wheelAccumRef = useRef(0);
  const wheelCooldownRef = useRef(false);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      e.preventDefault();
      if (wheelCooldownRef.current) return;

      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      wheelAccumRef.current += delta;

      const threshold = 50;
      if (Math.abs(wheelAccumRef.current) >= threshold) {
        const direction = wheelAccumRef.current > 0 ? 1 : -1;
        wheelAccumRef.current = 0;
        wheelCooldownRef.current = true;

        setCenterIndex(prev => {
          const next = prev + direction;
          if (next < 0) return days.length - 1;
          if (next >= days.length) return 0;
          return next;
        });

        setTimeout(() => { wheelCooldownRef.current = false; }, 300);
      }
    }
  }, [days.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (container && isActive) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel, isActive]);

  return {
    centerIndex,
    setCenterIndex,
    getPositionFromCenter,
    navigateCarousel,
    handleDayCardClick
  };
};
