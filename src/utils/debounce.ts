/**
 * Debouncer with an explicit generation counter.
 *
 * Auto match must never act on a list that has already been replaced by newer
 * keystrokes. Every scheduled run carries the generation it was created with;
 * a run whose generation is stale is dropped instead of executed.
 */
export interface ScheduledTask {
  readonly generation: number;
  cancel(): void;
}

export class GenerationDebouncer {
  private timer: number | null = null;
  private generation = 0;
  private readonly win: Window;

  constructor(win: Window) {
    this.win = win;
  }

  get currentGeneration(): number {
    return this.generation;
  }

  schedule(delayMs: number, run: (generation: number) => void): ScheduledTask {
    this.cancel();
    this.generation += 1;
    const generation = this.generation;
    this.timer = this.win.setTimeout(() => {
      this.timer = null;
      run(generation);
    }, delayMs);
    return {
      generation,
      cancel: () => {
        if (this.timer !== null) {
          this.win.clearTimeout(this.timer);
          this.timer = null;
        }
      },
    };
  }

  isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  cancel(): void {
    if (this.timer !== null) {
      this.win.clearTimeout(this.timer);
      this.timer = null;
    }
    this.generation += 1;
  }
}
