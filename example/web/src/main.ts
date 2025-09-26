import { Eko, LLMs, StreamCallbackMessage } from "@eko-ai/eko";
import { BrowserAgent } from "@eko-ai/eko-web";


export async function auto_test_case() {

  const openrouterApiKey = "your_api_key";
  const openrouterBaseURL = "https://openrouter.ai/api/v1";

  // Initialize LLM provider
  const llms: LLMs = {
    default: {
      provider: "openai-compatible",
      model: "google/gemini-2.5-pro", // any model support image input
      apiKey: openrouterApiKey || "",
      config: {
        baseURL: openrouterBaseURL,
      },
    },
  };

  const callback = {
    onMessage: async (message: StreamCallbackMessage) => {
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
