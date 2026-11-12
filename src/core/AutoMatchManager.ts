import type { AutoMatchAction, ConflictPolicy } from "../settings/DefaultSettings";
import type { MatchOptions } from "../types";
import { GenerationDebouncer } from "../utils/debounce";
import { isConfidentLevel, matchAll, resolveConflict } from "./MatchEngine";
import type { SuggestionContext } from "./SuggestionContext";

/** How long after an arrow key we refuse to move the highlight ourselves. */
const MANUAL_GRACE_MS = 1200;

export interface AutoMatchConfig {
  enabled: boolean;
  action: AutoMatchAction;
  delayMs: number;
  options: MatchOptions;
  policy: ConflictPolicy;
}

interface Watcher {
  context: SuggestionContext;
  observer: MutationObserver;
  debouncer: GenerationDebouncer;
  onListChange: () => void;
}

export interface AutoMatchDeps {
  getConfig(context: SuggestionContext): AutoMatchConfig | null;
  /** Called after every list change so badges can follow the new rows. */
  afterListChange(context: SuggestionContext): void;
  log(message: string, ...rest: unknown[]): void;
}

/**
 * Runs auto match whenever a suggestion list is rebuilt.
 *
 * Watching the list instead of the input has two consequences, both wanted:
 * the debounce only starts once results actually changed, and surfaces that
 * never expose their input element (editor suggesters) still work.
 */
export class AutoMatchManager {
  private readonly watchers = new Map<string, Watcher>();

  constructor(private readonly deps: AutoMatchDeps) {}

  watch(context: SuggestionContext): void {
    if (this.watchers.has(context.id)) return;

    const win = context.containerEl.ownerDocument.defaultView;
    const ObserverCtor = win?.MutationObserver;
    if (!win || !ObserverCtor) return;

    const debouncer = new GenerationDebouncer(win);
    const watcher: Watcher = {
      context,
      debouncer,
      observer: new ObserverCtor(() => this.onMutation(watcher)),
      onListChange: () => this.schedule(watcher),
    };

    watcher.observer.observe(context.containerEl, { childList: true });
    this.watchers.set(context.id, watcher);
    this.deps.afterListChange(context);
  }

  /** A list mutation means new results, so restart the idle timer. */
  private onMutation(watcher: Watcher): void {
    try {
      this.deps.afterListChange(watcher.context);
    } catch {
      // Badge rendering must never block matching.
    }
    this.schedule(watcher);
  }

  private schedule(watcher: Watcher): void {
    const config = this.deps.getConfig(watcher.context);
    if (!config?.enabled) return;
    watcher.debouncer.schedule(config.delayMs, (generation) => {
      this.runScheduled(watcher, generation);
    });
  }

  /** Run one match immediately, ignoring the idle delay (manual trigger). */
  runNow(context: SuggestionContext): boolean {
    const config = this.deps.getConfig(context);
    if (!config?.enabled) return false;
    return this.evaluate(context, config);
  }

  private runScheduled(watcher: Watcher, generation: number): void {
    if (watcher.debouncer.isStale(generation)) {
      this.deps.log("skip: stale generation", generation);
      return;
    }
    const config = this.deps.getConfig(watcher.context);
    if (!config?.enabled) return;
    this.evaluate(watcher.context, config);
  }

  private evaluate(context: SuggestionContext, config: AutoMatchConfig): boolean {
    if (!context.isAlive()) {
      this.unwatch(context.id);
      return false;
    }

    const query = context.getQuery();
    if (query.length === 0) return false;

    if (context.wasManuallyMoved(MANUAL_GRACE_MS)) {
      this.deps.log("skip: user is navigating", context.scene);
      return false;
    }

    const candidates = context.getCandidates();
    if (candidates.length === 0) return false;

    const hits = matchAll(
      candidates.map((candidate) => candidate.text),
      query,
      config.options,
    );
    const winner = resolveConflict(hits, config.policy);
    if (!winner) {
      this.deps.log("no winner", { query, hits: hits.length, policy: config.policy });
      return false;
    }

    const candidate = candidates[winner.index];
    if (!candidate) return false;
    if (candidate.index === context.getSelectedIndex()) return false;

    const confident = isConfidentLevel(winner.level);
    const action = config.action === "confirm" && confident ? "confirm" : "highlight";

    this.deps.log("matched", {
      query,
      text: candidate.text,
      level: winner.level,
      action,
    });

    if (action === "confirm") {
      context.commit(candidate.index);
      this.unwatch(context.id);
      return true;
    }

    context.setSelectedIndex(candidate.index);
    return true;
  }

  unwatch(contextId: string): void {
    const watcher = this.watchers.get(contextId);
    if (!watcher) return;
    watcher.observer.disconnect();
    watcher.debouncer.cancel();
    this.watchers.delete(contextId);
  }

  clear(): void {
    for (const id of Array.from(this.watchers.keys())) this.unwatch(id);
  }

  count(): number {
    return this.watchers.size;
  }
}
