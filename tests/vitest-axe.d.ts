// vitest-axe ships its `toHaveNoViolations` matcher type against the legacy
// `Vi` namespace, which vitest 3 no longer consults for the assertion chain
// (it augments its own `vitest` module interfaces instead). The matcher is
// registered at runtime in vitest.setup.ts; this declaration makes tsc see it
// on `expect(...)`. vitest.setup.ts is excluded from tsconfig, so the
// augmentation lives here under tests/ where the compiler picks it up.
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  interface Assertion<T = unknown> extends AxeMatchers {
    _axeAssertionMarker?: T;
  }
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
