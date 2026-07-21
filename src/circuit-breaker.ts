type State = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private state: State = 'closed';

  constructor(
    private readonly threshold: number,
    private readonly resetAfterMs: number
  ) {}

  canRequest(now = Date.now()): boolean {
    if (this.state !== 'open') return true;
    if (now - this.openedAt < this.resetAfterMs) return false;
    this.state = 'half-open';
    return true;
  }

  succeed(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  fail(now = Date.now()): void {
    this.failures += 1;
    if (this.state === 'half-open' || this.failures >= this.threshold) {
      this.state = 'open';
      this.openedAt = now;
    }
  }

  snapshot(): { state: State; failures: number } {
    return { state: this.state, failures: this.failures };
  }
}
