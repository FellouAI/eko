import type { StreamCallback, StreamCallbackMessage } from "../types/core.types";
import type { AgentContext } from "../core/context";

type MaybeCallback = StreamCallback | undefined | null;

export function composeCallbacks(...callbacks: MaybeCallback[]): StreamCallback {
  const list = callbacks.filter((c): c is StreamCallback => !!c && typeof c.onMessage === "function");
  return {
    onMessage: async (message: StreamCallbackMessage, agentContext?: AgentContext): Promise<void> => {
      for (const cb of list) {
        try {
          await cb.onMessage(message, agentContext);
        } catch (e) {
          // Isolate individual callback errors to avoid impacting main flow or others
        }
      }
    },
  };
}


