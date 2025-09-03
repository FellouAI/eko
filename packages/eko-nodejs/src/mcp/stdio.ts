import { Log, uuidv4 } from "@eko-ai/eko";
import {
  IMcpClient,
  McpCallToolParam,
  McpListToolParam,
  McpListToolResult,
  ToolResult,
} from "@eko-ai/eko/types";
import {
  spawn,
  SpawnOptionsWithoutStdio,
  ChildProcessWithoutNullStreams,
} from "child_process";

export class SimpleStdioMcpClient implements IMcpClient {
  private command: string;
  private args?: string[];
  private options?: SpawnOptionsWithoutStdio;
  private process: ChildProcessWithoutNullStreams | null = null;
  private requestMap: Map<string, (messageData: any) => void>;

  constructor(
    command: string,
    args?: string[],
    options?: SpawnOptionsWithoutStdio
  ) {
    this.command = command;
    this.args = args || [];
    this.options = options || {
      stdio: ["pipe", "pipe", "pipe"],
    };
    this.requestMap = new Map();
  }

  async connect(signal?: AbortSignal): Promise<void> {
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {}
    }
    this.process = spawn(this.command, this.args, this.options);
    this.process.stdout.on("data", (data) => {
      const response = data.toString().trim();
      Log.debug("MCP Client, onmessage", this.command, this.args, response);
      if (!response.startsWith("{")) {
        return;
      }
      const message = JSON.parse(response);
      if (message.id) {
        const callback = this.requestMap.get(message.id);
        if (callback) {
          callback(message);
        }
      }
    });
    this.process.on("error", (error) => {
      Log.error("MCP process error:", this.command, this.args, error);
    });
    Log.info("MCP Client, connection successful:", this.command, this.args);
  }

  async listTools(
    param: McpListToolParam,
    signal?: AbortSignal
  ): Promise<McpListToolResult> {
    const message = await this.sendMessage(
      "tools/list",
      {
        ...param,
      },
      signal
    );
    return message.result.tools || [];
  }

  async callTool(
    param: McpCallToolParam,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const message = await this.sendMessage(
      "tools/call",
      {
        ...param,
      },
      signal
    );
    return message.result;
  }

  async sendMessage(
    method: string,
    params: Record<string, any> = {},
    signal?: AbortSignal
  ) {
    if (!this.process) {
      await this.connect();
      if (!this.process) {
        throw new Error("Failed to connect to MCP server");
      }
    }
    const id = uuidv4();
    try {
      const callback = new Promise<any>((resolve, reject) => {
        if (signal) {
          signal.addEventListener("abort", () => {
            const error = new Error("Operation was interrupted");
            error.name = "AbortError";
            reject(error);
          });
        }
        this.requestMap.set(id, resolve);
      });
      const message = JSON.stringify({
        jsonrpc: "2.0",
        id: id,
        method: method,
        params: {
          ...params,
        },
      });
      Log.debug(`MCP Client, ${method}`, id, params);
      const suc = this.process.stdin.write(message + "\n", "utf-8");
      if (!suc) {
        throw new Error("SseClient Response Exception: " + message);
      }
      const messageData = await callback;
      this.handleError(method, messageData);
      return messageData;
    } finally {
      this.requestMap.delete(id);
    }
  }

  private handleError(method: string, message: any) {
    if (!message) {
      throw new Error(`MCP ${method} error: no response`);
    }
    if (message?.error) {
      Log.error(`MCP ${method} error: ` + message.error);
      throw new Error(
        `MCP ${method} error: ` +
          (typeof message.error === "string"
            ? message.error
            : message.error.message)
      );
    }
    if (message.result?.isError == true) {
      if (message.result.content) {
        throw new Error(
          `MCP ${method} error: ` +
            (typeof message.result.content === "string"
              ? message.result.content
              : message.result.content[0].text)
        );
      } else {
        throw new Error(`MCP ${method} error: ` + JSON.stringify(message.result));
      }
    }
  }

  isConnected(): boolean {
    return (
      this.process != null && !this.process.killed && !this.process.exitCode
    );
  }

  async close(): Promise<void> {
    this.process && this.process.kill();
  }
}
