import { Eko, LLMs, StreamCallbackMessage, SimpleHttpMcpClient, Agent, HumanCallback, StreamCallback, AgentContext } from "@eko-ai/eko";
import { BrowserAgent } from "@eko-ai/eko-web";
import { createOutReachAgent } from "./agents/OutReachAgent";

/**
 * Auto Outreach Case
 * 
 * This demonstrates a multi-agent workflow:
 * 1. BrowserAgent: Automatically browses the profile network, clicks on profiles,
 *    extracts profile information (name, email, domain, bio)
 * 2. OutReachAgent: Analyzes the extracted profiles, filters based on criteria,
 *    and sends personalized cold emails to matching profiles
 * 
 * The workflow:
 * - BrowserAgent navigates the page and extracts profile data
 * - OutReachAgent receives the profile data and decides who to contact
 * - OutReachAgent composes and sends personalized emails
 */
export async function auto_outreach_case() {
  // Read configuration from localStorage
  const openrouterApiKey = typeof window !== "undefined"
    ? localStorage.getItem("openrouter_api_key") || ""
    : "";
  const openrouterBaseURL = "https://openrouter.ai/api/v1";

  // MCP Server configuration
  // Configure MCP client to connect to custom-tools endpoint
  // Note: Backend route is registered under /api/v2 prefix, so full path is /api/v2/mcp/custom-tools
  // If authentication is needed, add Authorization token in headers
  const mcpBaseUrl = typeof window !== "undefined"
    ? localStorage.getItem("mcp_base_url") || "http://localhost:8000"
    : "http://localhost:8000";
  const id_token = typeof window !== "undefined"
    ? localStorage.getItem("id_token") || undefined
    : undefined;

  // Initialize MCP client
  const mcpClient = new SimpleHttpMcpClient(
    `${mcpBaseUrl}/api/v2/mcp/custom-tools`,
    "EkoMcpClient",
    id_token ? {
      "Authorization": `Bearer ${id_token}`,
    } : {}
  );

  // Initialize LLM provider
  const llms: LLMs = {
    default: {
      provider: "openai-compatible",
      model: "google/gemini-2.5-pro", // or any model that supports your needs
      apiKey: openrouterApiKey || "",
      config: {
        baseURL: openrouterBaseURL,
      },
    },
  };

  const callback: StreamCallback & HumanCallback = {
    onMessage: async (message: StreamCallbackMessage) => {
      // Log important messages for debugging
      // Uncomment to see detailed message flow
      // if (message.type == "workflow" && message.streamDone) {
      //   console.log("Workflow:", JSON.stringify(message, null, 2));
      // }
      // if (message.type == "text" && message.streamDone) {
      //   console.log("Text:", JSON.stringify(message, null, 2));
      // }
      // if (message.type == "tool_result") {
      //   console.log("Tool Result:", JSON.stringify(message, null, 2));
      // }
      return;
    },
    onHumanConfirm: async (agentContext: AgentContext, prompt: string) => {
      return window.confirm(prompt);
    },
    onHumanInput: async (agentContext: AgentContext, prompt: string) => {
      const result = window.prompt(prompt);
      return result || "";
    },
    onHumanSelect: async (
      agentContext: AgentContext,
      prompt: string,
      options: string[],
      multiple?: boolean
    ) => {
      if (multiple) {
        // 多选：让用户输入多个编号，用逗号分隔
        const optionsText = options.map((opt, idx) => `${idx + 1}. ${opt}`).join("\n");
        const userInput = window.prompt(
          `${prompt}\n\n${optionsText}\n\n请输入选项编号（多个用逗号分隔，如: 1,3,5）:`
        );
        if (!userInput) return [];
        const indices = userInput.split(",").map(s => parseInt(s.trim(), 10) - 1);
        return indices
          .filter(idx => idx >= 0 && idx < options.length)
          .map(idx => options[idx]);
      } else {
        // 单选：使用 prompt 让用户输入索引
        const optionsText = options.map((opt, idx) => `${idx + 1}. ${opt}`).join("\n");
        const userInput = window.prompt(`${prompt}\n\n${optionsText}\n\n请输入选项编号 (1-${options.length}):`);
        const index = parseInt(userInput || "0", 10) - 1;
        if (index >= 0 && index < options.length) {
          return [options[index]];
        }
        return [];
      }
    },
    onHumanHelp: async (
      agentContext: AgentContext,
      helpType: "request_login" | "request_assistance",
      prompt: string
    ) => {
      const message = helpType === "request_login"
        ? `需要登录帮助: ${prompt}\n\n请完成登录后点击确定。`
        : `需要协助: ${prompt}\n\n请完成操作后点击确定。`;
      return window.confirm(message);
    },
  };

  // Initialize agents
  // BrowserAgent: for browsing and extracting profile information
  // OutReachAgent: for analyzing profiles and sending emails
  // 
  // Note: Replace the tool_ids array with actual email tool UUIDs from your MCP server
  // Example: ["ca1586b6-258c-4f1b-84d0-b467124c542a"]
  const browserAgent = new BrowserAgent();
  const outreachAgent = createOutReachAgent();

  const agents: Agent[] = [outreachAgent];

  // Initialize eko with both agents and MCP client
  let eko = new Eko({
    llms,
    agents,
    callback,
    defaultMcpClient: mcpClient, // Configure default MCP client for all agents
    // enable_langfuse: true,
    // langfuse_options: {
    //   enabled: true,
    //   endpoint: "http://localhost:3418/otel-ingest",
    //   serviceName: "eko-outreach-service",
    //   serviceVersion: "1.0.0",
    //   useSendBeacon: true,
    //   batchBytesLimit: 800_000,
    //   recordStreaming: false,
    // }
  });

  // Run: Multi-agent workflow for profile screening and cold email outreach
  const result = await eko.run(`
    The user what to have contact with some one working in fellou
    Asking for the progress and their experience on Gen UI dev.
    
    Step 1 - Profile Analysis and Filtering:
       -  Find People working in Fellou
    Step 2 - Store the information in the variable pool:
       - After that, you should tell the user the information you have found.
    Step 2.5 - Ask the user about the content of the email:
       - But Before this, you have to ask the user about the content of the email.
    Step 3 - Send Emails:
       - After that, you should send the email to the user.
  `);

  if (result.success) {
    alert("Outreach workflow completed successfully!\n\n" + result.result);
  } else {
    alert("Outreach workflow failed:\n" + result.result);
  }
}

