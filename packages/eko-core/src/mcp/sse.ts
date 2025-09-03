import Log from "../common/log";
import { uuidv4 } from "../common/utils";
import {
  ToolResult,
  IMcpClient,
  McpCallToolParam,
  McpListToolParam,
  McpListToolResult,
} from "../types";

type SseEventData = {
  id?: string;
  event?: string;
  data?: string;
  [key: string]: unknown;
};

type SseHandler = {
  onopen: () => void;
  onmessage: (data: SseEventData) => void;
  onerror: (e: unknown) => void;
  readyState?: 0 | 1 | 2; // 0 init; 1 connected; 2 closed
  close?: Function;
};

export class SimpleSseMcpClient implements IMcpClient {
  private sseUrl: string;
  private clientName: string;
  private sseHandler?: SseHandler;
  private msgUrl?: string;
  private pingTimer?: any;
  private reconnectTimer?: any;
  private headers: Record<string, string>;
  private protocolVersion: string = "2024-11-05";
  private requestMap: Map<string, (messageData: any) => void>;

  constructor(
    sseServerUrl: string,
    clientName: string = "EkoMcpClient",
    headers: Record<string, string> = {}
  ) {
    this.sseUrl = sseServerUrl;
    this.clientName = clientName;
    this.headers = headers;
    this.requestMap = new Map();
  }

  async connect(signal?: AbortSignal): Promise<void> {
    Log.info("MCP Client, connecting...", this.sseUrl);
    if (this.sseHandler && this.sseHandler.readyState == 1) {
      this.sseHandler.close && this.sseHandler.close();
      this.sseHandler = undefined;
    }
    this.pingTimer && clearInterval(this.pingTimer);
    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 15000);
      this.sseHandler = {
        onopen: () => {
          Log.info("MCP Client, connection successful", this.sseUrl);
          clearTimeout(timer);
          setTimeout(resolve, 200);
        },
        onmessage: (data) => this.onmessage(data),
        onerror: (e) => {
          Log.error("MCP Client, error: ", e);
          clearTimeout(timer);
          if (this.sseHandler?.readyState === 2) {
            this.pingTimer && clearInterval(this.pingTimer);
            this.reconnectTimer = setTimeout(() => {
              this.connect();
            }, 500);
          }
          resolve();
        },
      };
      connectSse(this.sseUrl, this.sseHandler, this.headers, signal);
    });
    this.pingTimer = setInterval(() => this.ping(), 10000);
  }

  onmessage(data: SseEventData) {
    Log.debug("MCP Client, onmessage", this.sseUrl, data);
    if (data.event == "endpoint") {
      let uri = data.data as string;
      let msgUrl: string;
      let idx = this.sseUrl.indexOf("/", 10);
      if (idx > -1) {
        msgUrl = this.sseUrl.substring(0, idx) + uri;
      } else {
        msgUrl = this.sseUrl + uri;
      }
      this.msgUrl = msgUrl;
      this.initialize();
    } else if (data.event == "message") {
      let message = JSON.parse(data.data as string);
      let _resolve = this.requestMap.get(message.id);
      _resolve && _resolve(message);
    }
  }

  private async initialize() {
    await this.request("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {
        tools: {
          listChanged: true,
        },
        sampling: {},
      },
      clientInfo: {
        name: this.clientName,
        version: "1.0.0",
      },
    });
    // this.request("notifications/initialized", {});
  }

  private ping() {
    this.request("ping", {});
  }

  async listTools(
    param: McpListToolParam,
    signal?: AbortSignal
  ): Promise<McpListToolResult> {
    const message = await this.request(
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
    const message = await this.request(
      "tools/call",
      {
        ...param,
      },
      signal
    );
    return message.result;
  }

  private async request(
    method: string,
    params: Record<string, any>,
    signal?: AbortSignal
  ): Promise<any> {
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
      Log.debug(`MCP Client, ${method}`, id, params);
      const response = await fetch(this.msgUrl as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: id,
          method: method,
          params: {
            ...params,
          },
        }),
        signal: signal,
      });
      const body = await response.text();
      if (body == "Accepted") {
        const message = await callback;
        if (message.error) {
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
            throw new Error(
              `MCP ${method} error: ` + JSON.stringify(message.result)
            );
          }
        }
        return message;
      } else {
        throw new Error(`MCP ${method} error:` + body);
      }
    } finally {
      this.requestMap.delete(id);
    }
  }

  isConnected(): boolean {
    if (this.sseHandler && this.sseHandler.readyState == 1) {
      return true;
    }
    return false;
  }

  async close(): Promise<void> {
    this.pingTimer && clearInterval(this.pingTimer);
    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    this.sseHandler && this.sseHandler.close && this.sseHandler.close();
    this.pingTimer = undefined;
    this.sseHandler = undefined;
    this.reconnectTimer = undefined;
  }
}

async function connectSse(
  sseUrl: string,
  hander: SseHandler,
  headers: Record<string, string> = {},
  _signal?: AbortSignal
) {
  try {
    hander.readyState = 0;
    const controller = new AbortController();
    const signal = _signal
      ? AbortSignal.any([controller.signal, _signal])
      : controller.signal;
    const response = await fetch(sseUrl, {
      method: "GET",
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        ...headers,
      },
      body: null,
      keepalive: true,
      signal: signal,
    });
    const reader = response.body?.getReader() as ReadableStreamDefaultReader;
    hander.close = () => {
      controller.abort();
      hander.readyState = 2;
      Log.debug("McpClient close abort.", sseUrl);
    };
    let str = "";
    const decoder = new TextDecoder();
    hander.readyState = 1;
    hander.onopen();
    while (hander.readyState == 1) {
      const { value, done } = await reader?.read();
      if (done) {
        break;
      }
      const text = decoder.decode(value);
      str += text;
      if (str.indexOf("\n\n") > -1) {
        const chunks = str.split("\n\n");
        for (let i = 0; i < chunks.length - 1; i++) {
          const chunk = chunks[i];
          const chunkData = parseChunk(chunk);
          hander.onmessage(chunkData);
        }
        str = chunks[chunks.length - 1];
      }
    }
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      Log.error("MCP Client, connectSse error:", e);
      hander.onerror(e);
    }
  } finally {
    hander.readyState = 2;
  }
}

function parseChunk(chunk: string): SseEventData {
  const lines = chunk.split("\n");
  const chunk_obj: SseEventData = {};
  for (let j = 0; j < lines.length; j++) {
    const line = lines[j];
    if (line.startsWith("id:")) {
      chunk_obj["id"] = line.substring(3).trim();
    } else if (line.startsWith("event:")) {
      chunk_obj["event"] = line.substring(6).trim();
    } else if (line.startsWith("data:")) {
      chunk_obj["data"] = line.substring(5).trim();
    } else {
      const idx = line.indexOf(":");
      if (idx > -1) {
        chunk_obj[line.substring(0, idx)] = line.substring(idx + 1).trim();
      }
    }
  }
  return chunk_obj;
}
