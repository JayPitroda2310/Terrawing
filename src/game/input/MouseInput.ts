/**
 * Pointer-lock mouse look. Movement deltas accumulate between frames and are consumed by the camera.
 */
export class MouseInput {
  private deltaX = 0;
  private deltaY = 0;
  private element: HTMLElement | null = null;
  private readonly lockListeners = new Set<(locked: boolean) => void>();

  attach(element: HTMLElement): void {
    this.detach();
    this.element = element;
    document.addEventListener('mousemove', this.handleMove);
    document.addEventListener('pointerlockchange', this.handleLockChange);
  }

  detach(): void {
    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    this.element = null;
  }

  get locked(): boolean {
    return this.element !== null && document.pointerLockElement === this.element;
  }

  requestLock(): void {
    if (!this.element || this.locked) return;
    try {
      const result = this.element.requestPointerLock() as unknown;
      // Browsers reject re-locking shortly after an unlock; that is expected and harmless.
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      /* pointer lock unavailable (e.g. iframe sandbox) — mouse look stays disabled */
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  onLockChange(listener: (locked: boolean) => void): () => void {
    this.lockListeners.add(listener);
    return () => this.lockListeners.delete(listener);
  }

  /** Returns accumulated movement since the last call and resets it. */
  consumeDelta(out: { x: number; y: number }): { x: number; y: number } {
    out.x = this.deltaX;
    out.y = this.deltaY;
    this.deltaX = 0;
    this.deltaY = 0;
    return out;
  }

  private readonly handleMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.deltaX += event.movementX;
    this.deltaY += event.movementY;
  };

  private readonly handleLockChange = (): void => {
    const locked = this.locked;
    if (!locked) {
      this.deltaX = 0;
      this.deltaY = 0;
    }
    for (const listener of this.lockListeners) listener(locked);
  };
}
