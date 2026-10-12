import type { ProjectKind } from '@/types/project';
export function getProjectKind(project: { project_kind?: ProjectKind | null; is_internal?: boolean }): ProjectKind {
  return project.project_kind ?? (project.is_internal ? 'internal_activity' : 'customer');
}
export function isInternalProject(project: { project_kind?: ProjectKind | null; is_internal?: boolean }): boolean {
  return getProjectKind(project) !== 'customer';
}
export function optionalNonNegative(value: string, scale = 1): number | null {
  if (!value.trim()) return null;
  const number = Number(value.replace(',', '.'));
  if (!Number.isFinite(number) || number < 0) throw new Error('Budget och prognos måste vara positiva tal eller tomma.');
  const result = scale === 1 ? number : Math.round(number * scale);
  if (result > Number.MAX_SAFE_INTEGER) throw new Error('Beloppet är för stort.');
  return result;
}
