/** Types for the test-only guard mutex. See guard-lock.mjs for why it exists. */
export function withGuardLock<T>(fn: () => T | Promise<T>): Promise<T>;
