import { Eko, LLMs, AgentStreamMessage } from "@eko-ai/eko";
import { BrowserAgent } from "@eko-ai/eko-web";

export async function auto_test_case() {
  // Initialize LLM provider
  const llms: LLMs = {
    default: {
      provider: "openai-compatible",
      model: "anthropic/claude-sonnet-4.5",
      apiKey: "your_openrouter_key",
      config: {
        baseURL: "https://openrouter.ai/api/v1",
      },
    },
  };

  const callback = {
    onMessage: async (message: AgentStreamMessage) => {
      if (message.type == "workflow" && !message.streamDone) {
        return;
      }
      if (message.type == "text" && !message.streamDone) {
        return;
      }
      if (message.type == "tool_streaming") {
        return;
      }
      console.log("message: ", JSON.stringify(message, null, 2));
    },
  };

  // Initialize eko
  let agents = [new BrowserAgent()];
  let eko = new Eko({ llms, agents, callback });

  // Run: Generate workflow from natural language description
  const result = await eko.run(`
    Current login page automation test:
    1. Correct account and password are: admin / 666666 
    2. Please randomly combine usernames and passwords for testing to verify if login validation works properly, such as: username cannot be empty, password cannot be empty, incorrect username, incorrect password
    3. Finally, try to login with the correct account and password to verify if login is successful
    4. Generate test report and export
  `);

  if (result.success) {
    alert("Execution successful:\n" + result.result);
  } else {
    alert("Execution failed:\n" + result.result);
  }

}