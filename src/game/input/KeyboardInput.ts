/** Tracks held keys and key-down edges by `KeyboardEvent.code`. */
export class KeyboardInput {
  private readonly held = new Set<string>();
  private readonly listeners = new Set<(code: string) => void>();
  private attached = false;

  /** Codes whose default browser behaviour (scrolling, focus) should be suppressed. */
  constructor(private readonly capturedCodes: () => ReadonlySet<string>) {}

  attach(target: Window = window): void {
    if (this.attached) return;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
    target.addEventListener('blur', this.handleBlur);
    this.attached = true;
  }

  detach(target: Window = window): void {
    target.removeEventListener('keydown', this.handleKeyDown);
    target.removeEventListener('keyup', this.handleKeyUp);
    target.removeEventListener('blur', this.handleBlur);
    this.attached = false;
    this.held.clear();
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** Subscribe to key-down edges (auto-repeat ignored). */
  onKeyDown(listener: (code: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    if (this.capturedCodes().has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.code);
    for (const listener of this.listeners) listener(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.held.clear();
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
