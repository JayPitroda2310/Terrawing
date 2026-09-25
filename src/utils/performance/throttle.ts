/** Fixed-interval accumulator for throttling work inside a frame loop without timers. */
export class IntervalGate {
  private elapsed = 0;

  constructor(private readonly interval: number) {}

  /** Returns true when the interval has elapsed since the last successful tick. */
  tick(dt: number): boolean {
    this.elapsed += dt;
    if (this.elapsed < this.interval) return false;
    this.elapsed %= this.interval;
    return true;
  }

  reset(): void {
    this.elapsed = 0;
  }
}
