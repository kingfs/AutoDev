import type { RunState } from "../state/model.js";
import type { RunStateStore } from "../state/store.js";

export interface Condition {
  name: string;
  satisfied(state: RunState): boolean;
  run(state: RunState): Promise<void>;
}

export async function reconcile(
  state: RunState,
  store: RunStateStore,
  conditions: readonly Condition[],
  maxTransitions = 50,
): Promise<RunState> {
  for (let transition = 0; transition < maxTransitions; transition += 1) {
    if (state.status !== "running") return state;
    const next = conditions.find((condition) => !condition.satisfied(state));
    if (!next) return state;
    state.currentStage = next.name;
    await store.save(state);
    await next.run(state);
    await store.save(state);
  }
  throw new Error(`workflow exceeded ${maxTransitions} transitions`);
}
