import { Log } from "@eko-ai/eko";
import { SimpleStdioMcpClient } from "../src";

async function testMcp() {
  const mcpClient = new SimpleStdioMcpClient("pnpm", [
    "-y",
    "mcp-server-code-runner@latest",
  ]);
  await mcpClient.connect();
  const tools = await mcpClient.listTools({
    environment: "browser",
    agent_name: "Browser",
    prompt: "Hello, world!",
  });
  console.log("tools:", JSON.stringify(tools, null, 2));
  const toolResult = await mcpClient.callTool({
    name: tools[0].name,
    arguments: {
      languageId: "javascript",
      code: "console.log('Hello, world!');",
    },
  });
  console.log("toolResult:", JSON.stringify(toolResult, null, 2));
  await mcpClient.close();
}

test.only("mcp", async () => {
  Log.setLevel(0);
  await testMcp();
});
