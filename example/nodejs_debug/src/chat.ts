import { Agent, AgentContext } from "@eko-ai/eko";
import { IMcpClient, ToolResult } from "@eko-ai/eko/types";

export default class SimpleChatAgent extends Agent {
  constructor(llms?: string[], mcpClient?: IMcpClient) {
    super({
      name: "SimpleChatAgent",
      description: "You are a helpful assistant.",
      tools: [
        {
          name: "get_weather",
          description: "weather query",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                default: "Beijing",
              },
            },
          },
          execute: async (
            args: Record<string, unknown>,
            agentContext: AgentContext
          ): Promise<ToolResult> => {
            return await this.callInnerTool(() =>
              (async () =>
                `Today, the weather in ${args.city} is cloudy, 25-30° (Celsius), suitable for going out for a walk.`)()
            );
          },
        },
      ],
      llms: llms,
      mcpClient: mcpClient,
      planDescription:
        "Chat assistant, handles non-task related conversations. Please use it to reply when the task does not involve operations with other agents.",
    });
  }
}
