// Replace this composition with your host's workflow adapter. The injected
// provider and evidence lookup are synthetic; keep them unchanged in this test.
import { createTurnWorkflow } from "./turn-boundary/workflow.mjs";

export function createWorkflow(dependencies) {
  return createTurnWorkflow(dependencies);
}
