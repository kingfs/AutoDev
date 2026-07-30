import { currentRevision, type RunState } from "../state/model.js";

export function emitRunEvent(state: RunState): void {
  const event = {
    type: "autodev.run.state",
    timestamp: state.updatedAt,
    runId: state.runId,
    provider: state.workItem.provider,
    repository: state.workItem.repository.fullName,
    issue: state.workItem.issue.number,
    stage: state.currentStage,
    status: state.status,
    revision: currentRevision(state)?.number ?? null,
  };
  console.log(`__AUTODEV_EVENT__${JSON.stringify(event)}`);
}
