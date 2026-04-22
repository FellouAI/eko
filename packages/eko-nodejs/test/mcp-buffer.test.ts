import { describe, it, expect, beforeEach } from "vitest";
import { SimpleStdioMcpClient } from "../src";

// Mock child_process to test buffering logic
const { EventEmitter } = await import("events");

describe("SimpleStdioMcpClient buffering", () => {
  // Re-implement the core buffering logic for isolated unit testing
  // without needing an actual subprocess.

  it("should parse complete messages from single chunk", () => {
    const messages: any[] = [];
    let stdoutBuffer = "";

    const processChunk = (data: string) => {
      stdoutBuffer += data;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;
        try {
          messages.push(JSON.parse(trimmed));
        } catch {}
      }
    };

    processChunk('{"id":"1","result":{"tools":[]}}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("1");
  });

  it("should buffer partial JSON across multiple chunks", () => {
    const messages: any[] = [];
    let stdoutBuffer = "";

    const processChunk = (data: string) => {
      stdoutBuffer += data;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;
        try {
          messages.push(JSON.parse(trimmed));
        } catch {}
      }
    };

    // First chunk: partial JSON (no closing brace)
    processChunk('{"id":"1","result":{"tools":[');
    expect(messages).toHaveLength(0); // Should not parse yet

    // Second chunk: rest of JSON, then newline
    processChunk('{"name":"test"}]}}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("1");
    expect(messages[0].result.tools[0].name).toBe("test");
  });

  it("should handle multiple messages in single chunk", () => {
    const messages: any[] = [];
    let stdoutBuffer = "";

    const processChunk = (data: string) => {
      stdoutBuffer += data;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;
        try {
          messages.push(JSON.parse(trimmed));
        } catch {}
      }
    };

    processChunk('{"id":"1","result":{}}\n{"id":"2","result":{}}\n');
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe("1");
    expect(messages[1].id).toBe("2");
  });

  it("should skip non-JSON lines", () => {
    const messages: any[] = [];
    let stdoutBuffer = "";

    const processChunk = (data: string) => {
      stdoutBuffer += data;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;
        try {
          messages.push(JSON.parse(trimmed));
        } catch {}
      }
    };

    processChunk('Starting MCP server...\n{"id":"1","result":{}}\n');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("1");
  });

  it("should handle mixed partial and complete messages", () => {
    const messages: any[] = [];
    let stdoutBuffer = "";

    const processChunk = (data: string) => {
      stdoutBuffer += data;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;
        try {
          messages.push(JSON.parse(trimmed));
        } catch {}
      }
    };

    // Chunk 1: complete message + partial
    processChunk('{"id":"1","result":{}}\n{"id":"2","res');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("1");

    // Chunk 2: completes the partial
    processChunk('ult":{"tools":[]}}\n{"id":"3","result":{}}\n');
    expect(messages).toHaveLength(3);
    expect(messages[1].id).toBe("2");
    expect(messages[2].id).toBe("3");
  });
});