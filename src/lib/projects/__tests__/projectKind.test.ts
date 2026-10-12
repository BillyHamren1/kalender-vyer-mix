import {describe,it,expect} from 'vitest';
import {getProjectKind, isInternalProject,optionalNonNegative} from '../projectKind';
describe('project classification preserves legacy warehouse identity',()=>{
 it('classifies legacy warehouse but does not infer standalone customer as internal',()=>{
  expect(getProjectKind({is_internal:true})).toBe('internal_activity');
  expect(getProjectKind({is_internal:false})).toBe('customer');
  expect(getProjectKind({})).toBe('customer');
 });
 it('supports explicit finite projects with legacy warehouse flag false',()=>{
  expect(isInternalProject({project_kind:'internal_project',is_internal:false})).toBe(true);
  expect(isInternalProject({project_kind:'customer',is_internal:false})).toBe(false);
 });
 it('keeps unknown budget different from confirmed zero',()=>{
  expect(optionalNonNegative('')).toBeNull(); expect(optionalNonNegative('0')).toBe(0);
  expect(optionalNonNegative('12,34',100)).toBe(1234);
  expect(()=>optionalNonNegative('-1')).toThrow(); expect(()=>optionalNonNegative('NaN')).toThrow();
 });
});
