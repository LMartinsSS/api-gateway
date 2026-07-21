import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and recovers through half-open', () => {
    const breaker = new CircuitBreaker(2, 100);
    breaker.fail(1_000);
    expect(breaker.canRequest(1_001)).toBe(true);
    breaker.fail(1_002);
    expect(breaker.canRequest(1_050)).toBe(false);
    expect(breaker.canRequest(1_103)).toBe(true);
    breaker.succeed();
    expect(breaker.snapshot()).toEqual({ state: 'closed', failures: 0 });
  });
});
