import type { ActionResult, StepMetadata } from './types';
import type { BrowserStateHistory } from '../browser/views';

export class AgentStepRecord {
  modelOutput: string | null;
  result: ActionResult[];
  state: BrowserStateHistory;
  metadata?: StepMetadata | null;

  constructor(
    modelOutput: string | null,
    result: ActionResult[],
    state: BrowserStateHistory,
    metadata?: StepMetadata | null,
  ) {
    this.modelOutput = modelOutput;
    this.result = result;
    this.state = state;
    this.metadata = metadata;
  }
}

export class AgentStepHistory {
  history: AgentStepRecord[];

  constructor(history?: AgentStepRecord[]) {
    this.history = history ?? [];
  }
}
