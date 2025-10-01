import { Eko, LLMs, StreamCallbackMessage } from "@eko-ai/eko";
import { BrowserAgent } from "@eko-ai/eko-web";
import { TraceSystem } from "@eko-ai/eko-debugger";

export async function auto_test_case() {

  const openrouterApiKey = "api_key";
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
      // if (message.type == "workflow" && !message.streamDone) {
      //   return;
      // }
      // if (message.type == "text" && !message.streamDone) {
      //   return;
      // }
      // if (message.type == "tool_streaming") {
      //   return;
      // }
      // console.log("message: ", JSON.stringify(message, null, 2));
      return;
    },
  };

  // Initialize eko
  let agents = [new BrowserAgent()];
  let eko = new Eko({
    llms, agents, callback, enable_langfuse: true,
    langfuse_options: {
      enabled: true,
      endpoint: "http://localhost:3418/otel-ingest",
      serviceName: "eko-service",
      serviceVersion: "1.0.0",
      /** Whether to use navigator.sendBeacon if available (browser only) */
      useSendBeacon: true,
      /** Max payload size in bytes, default 800_000 (800KB) */
      batchBytesLimit: 800_000,
      /** Whether to record streaming events like plan_process, default false */
      recordStreaming: false,
    }
  });

  const tracer = new TraceSystem();
  tracer.enable(eko);

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
