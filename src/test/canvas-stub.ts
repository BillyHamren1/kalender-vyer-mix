// Stub for the optional `canvas` native module that jsdom tries to load.
// We don't render to canvas in tests, so a noop is fine and avoids the
// missing native binding error on this sandbox.
export default {};
