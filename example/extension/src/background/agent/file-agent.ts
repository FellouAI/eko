import { Agent, AgentContext } from "@eko-ai/eko";
import { LanguageModelV2ToolCallPart, ToolResult } from "@eko-ai/eko/types";

export default class WriteFileAgent extends Agent {
  constructor() {
    super({
      name: "WriteFile",
      description:
        "File writing tool, used for writing content to local files.",
      tools: [
        {
          name: "write_file",
          parameters: {
            type: "object",
            properties: {
              filename: {
                type: "string",
                description:
                  "File name only, path is not supported. For example: data.md",
              },
              content: {
                type: "string",
                description: "The content to write to the file.",
              },
            },
          },
          execute: async (
            args: Record<string, unknown>,
            agentContext: AgentContext,
            toolCall: LanguageModelV2ToolCallPart
          ): Promise<ToolResult> => {
            return this.writeFile(
              args.filename as string,
              args.content as string
            );
          },
        },
      ],
      llms: [],
    });
  }

  private async writeFile(
    filename: string,
    content: string
  ): Promise<ToolResult> {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const encodedContent = encodeURIComponent(content);
    const dataUrl = `data:text/plain;charset=utf-8,${encodedContent}`;
    await new Promise<void>((resolve, reject) => {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: sanitizedFilename,
          saveAs: false,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (downloadId === undefined) {
            reject(new Error("Failed to download: no download ID returned"));
          } else {
            resolve();
          }
        }
      );
    });

    return {
      content: [
        {
          type: "text",
          text: `File written successfully: ${sanitizedFilename}`,
        },
      ],
    };
  }

  private sanitizeFilename(filename: string): string {
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/g;
    let sanitized = filename.replace(invalidChars, "_");
    sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, "");
    if (!sanitized) {
      sanitized = "untitled.txt";
    }
    if (sanitized.length > 255) {
      const ext = this.getFileExtension(sanitized);
      const nameWithoutExt = sanitized.slice(0, 255 - ext.length);
      sanitized = nameWithoutExt + ext;
    }
    return sanitized;
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    return lastDot !== -1 ? filename.slice(lastDot) : "";
  }
}

export { WriteFileAgent };
