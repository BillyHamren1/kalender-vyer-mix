import nodeAssert from "node:assert/strict";

export function assert(condition: unknown, message?: string): asserts condition {
  nodeAssert.ok(condition, message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  nodeAssert.deepStrictEqual(actual, expected, message);
}

export function assertExists<T>(value: T, message?: string): asserts value is NonNullable<T> {
  nodeAssert.notStrictEqual(value, null, message);
  nodeAssert.notStrictEqual(value, undefined, message);
}
