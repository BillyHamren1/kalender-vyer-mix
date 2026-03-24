import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  getDerivedProjects,
  getDerivedProducts,
  getDerivedProductCombinations,
  getDerivedStaff,
  getDerivedPeriods,
  type DerivedFilter,
  type DerivedProject,
  type DerivedProduct,
  type DerivedProductCombination,
  type DerivedStaff,
  type DerivedPeriod,
} from '@/services/derivedAnalyticsService';
import { getDistinctFilterValues } from '@/services/projectAnalyticsService';

export interface AnalyticsFilter extends DerivedFilter {}

export function useDerivedAnalytics(filter: AnalyticsFilter = {}) {
  const projects = useQuery({
    queryKey: ['derived-projects', filter],
    queryFn: () => getDerivedProjects(filter),
    staleTime: 5 * 60 * 1000,
  });

  const products = useQuery({
    queryKey: ['derived-products', filter],
    queryFn: () => getDerivedProducts(filter),
    staleTime: 5 * 60 * 1000,
  });

  const combinations = useQuery({
    queryKey: ['derived-combinations'],
    queryFn: () => getDerivedProductCombinations(),
    staleTime: 10 * 60 * 1000,
  });

  const staff = useQuery({
    queryKey: ['derived-staff', filter],
    queryFn: () => getDerivedStaff(filter),
    staleTime: 5 * 60 * 1000,
  });

  const periods = useQuery({
    queryKey: ['derived-periods', filter],
    queryFn: () => getDerivedPeriods(filter),
    staleTime: 5 * 60 * 1000,
  });

  const filterValues = useQuery({
    queryKey: ['analytics-filter-values'],
    queryFn: () => getDistinctFilterValues(),
    staleTime: 30 * 60 * 1000,
  });

  const isLoading = projects.isLoading || products.isLoading || periods.isLoading;

  return {
    projects: projects.data || [],
    products: products.data || [],
    combinations: combinations.data || [],
    staff: staff.data || [],
    periods: periods.data || [],
    filterValues: filterValues.data,
    isLoading,
  };
}
