// Vitest shim — replaces the real `server-only` marker (which throws on
// non-server import) with a no-op so server modules can be unit-tested in
// Node when their network / DB dependencies are mocked.
export {};
