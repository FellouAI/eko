import { Agent } from "../agent";
import { DialogueTool } from "../types";
import { Tool, ToolSchema } from "../types/tools.types";
import { LanguageModelV2FunctionTool } from "@ai-sdk/provider";

export function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), time));
}

export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function call_timeout<R extends Promise<any>>(
  fun: () => R,
  timeout: number,
  error_callback?: (e: string) => void
): Promise<R> {
  return new Promise(async (resolve, reject) => {
    let timer = setTimeout(() => {
      reject(new Error("Timeout"));
      error_callback && error_callback("Timeout");
    }, timeout);
    try {
      const result = await fun();
      clearTimeout(timer);
      resolve(result);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
      error_callback && error_callback(e + "");
    }
  });
}

export function convertToolSchema(
  tool: ToolSchema
): LanguageModelV2FunctionTool {
  if ("function" in tool) {
    return {
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      inputSchema: tool.function.parameters,
    };
  } else if ("input_schema" in tool) {
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      inputSchema: tool.input_schema,
    };
  } else if ("inputSchema" in tool) {
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  } else {
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    };
  }
}

export function toImage(mediaData: string): Uint8Array | string | URL {
  return toFile(mediaData);
}

export function toFile(
  mediaData: string,
  type: "base64|url" | "binary|url" = "base64|url"
): Uint8Array | string | URL {
  if (mediaData.startsWith("http://") || mediaData.startsWith("https://")) {
    return new URL(mediaData);
  } else if (
    mediaData.startsWith("//") &&
    mediaData.indexOf(".") > 0 &&
    mediaData.length < 1000
  ) {
    return new URL("https:" + mediaData);
  }
  if (mediaData.startsWith("data:")) {
    mediaData = mediaData.substring(mediaData.indexOf(",") + 1);
  }
  if (type === "binary|url") {
    // @ts-ignore
    if (typeof Buffer != "undefined") {
      // @ts-ignore
      const buffer = Buffer.from(mediaData, "base64");
      return new Uint8Array(buffer);
    } else {
      const binaryString = atob(mediaData);
      const fileData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        fileData[i] = binaryString.charCodeAt(i);
      }
      return fileData;
    }
  } else {
    return mediaData;
  }
}

export function getMimeType(data: string): string {
  let mediaType = "image/png";
  if (data.startsWith("data:")) {
    mediaType = data.split(";")[0].split(":")[1];
  } else if (data.indexOf(".") > -1) {
    if (data.indexOf(".png") > -1) {
      mediaType = "image/png";
    } else if (data.indexOf(".jpg") > -1 || data.indexOf(".jpeg") > -1) {
      mediaType = "image/jpeg";
    } else if (data.indexOf(".pdf") > -1) {
      mediaType = "application/pdf";
    } else if (data.indexOf(".docx") > -1) {
      mediaType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (data.indexOf(".xlsx") > -1) {
      mediaType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (data.indexOf(".pptx") > -1) {
      mediaType =
        "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    } else if (data.indexOf(".txt") > -1) {
      mediaType = "text/plain";
    } else if (data.indexOf(".md") > -1) {
      mediaType = "text/markdown";
    } else if (data.indexOf(".json") > -1) {
      mediaType = "application/json";
    } else if (data.indexOf(".xml") > -1) {
      mediaType = "application/xml";
    } else if (data.indexOf(".csv") > -1) {
      mediaType = "text/csv";
    }
  }
  return mediaType;
}

export async function compressImageData(
  imageBase64: string,
  imageType: "image/jpeg" | "image/png",
  compress:
    | { scale: number }
    | {
        resizeWidth: number;
        resizeHeight: number;
      },
  quality?: number
): Promise<{
  imageBase64: string;
  imageType: "image/jpeg" | "image/png";
}> {
  const base64Data = imageBase64;
  const binaryString =
    typeof atob !== "undefined"
      ? atob(base64Data)
      : // @ts-ignore
        Buffer.from(base64Data, "base64").toString("binary");
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  if (!quality) {
    if (bytes.length >= 1024 * 1024 * 3) {
      quality = 0.6;
    } else if (bytes.length >= 1024 * 1024 * 1.5) {
      quality = 0.8;
    } else {
      quality = 1;
    }
  }
  const targetByScale = (bitmapWidth: number, bitmapHeight: number) => ({
    width: (compress as any).scale
      ? bitmapWidth * (compress as any).scale
      : (compress as any).resizeWidth,
    height: (compress as any).scale
      ? bitmapHeight * (compress as any).scale
      : (compress as any).resizeHeight,
  });

  const hasOffscreen = typeof OffscreenCanvas !== "undefined";
  const hasCreateImageBitmap = typeof createImageBitmap !== "undefined";
  const hasDOM =
    typeof document !== "undefined" && typeof Image !== "undefined";
  const isNode =
    typeof window === "undefined" &&
    // @ts-ignore
    typeof process !== "undefined" &&
    // @ts-ignore
    !!process.versions &&
    // @ts-ignore
    !!process.versions.node;

  const loadImageAny = async () => {
    if (hasCreateImageBitmap) {
      const blob = new Blob([bytes], { type: imageType });
      const bitmap = await createImageBitmap(blob);
      return { img: bitmap, width: bitmap.width, height: bitmap.height };
    }
    if (hasDOM) {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (e) => reject(e);
        image.src = `data:${imageType};base64,${imageBase64}`;
      });
      return { img, width: img.width, height: img.height };
    }
    if (isNode) {
      const canvasMod = await loadPackage("canvas");
      const { loadImage } = canvasMod as any;
      const dataUrl = `data:${imageType};base64,${imageBase64}`;
      const img = await loadImage(dataUrl);
      return { img, width: img.width, height: img.height };
    }
    throw new Error("No image environment available");
  };

  const createCanvasAny = async (width: number, height: number) => {
    if (hasOffscreen) {
      const canvas = new OffscreenCanvas(width, height) as any;
      return {
        ctx: canvas.getContext("2d") as any,
        exportBase64: async (mime: string, q?: number) => {
          const blob = await canvas.convertToBlob({ type: mime, quality: q });
          return await new Promise<string>((res, rej) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const url = reader.result as string;
              res(url.substring(url.indexOf("base64,") + 7));
            };
            reader.onerror = () =>
              rej(new Error("Failed to convert blob to base64"));
            reader.readAsDataURL(blob);
          });
        },
      };
    }
    if (hasDOM) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return {
        ctx: canvas.getContext("2d") as any,
        exportBase64: async (mime: string, q?: number) => {
          const dataUrl = canvas.toDataURL(mime, q);
          return dataUrl.substring(dataUrl.indexOf("base64,") + 7);
        },
      };
    }
    if (isNode) {
      const canvasMod = await loadPackage("canvas");
      const { createCanvas } = canvasMod as any;
      const canvas = createCanvas(width, height);
      return {
        ctx: canvas.getContext("2d"),
        exportBase64: async (mime: string, q?: number) => {
          const buffer: any = canvas.toBuffer(mime, { quality: q });
          const _Buffer =
            // @ts-ignore
            typeof Buffer !== "undefined" ? Buffer.from(buffer) : buffer;
          return _Buffer.toString("base64");
        },
      };
    }
    throw new Error("No canvas environment available");
  };

  const loaded = await loadImageAny();
  const { width, height } = targetByScale(loaded.width, loaded.height);
  if (loaded.width == width && loaded.height == height && quality == 1) {
    return {
      imageBase64: imageBase64,
      imageType: imageType,
    };
  }
  const { ctx, exportBase64 } = await createCanvasAny(width, height);
  if (!ctx) {
    return {
      imageBase64: imageBase64,
      imageType: imageType,
    };
  }
  ctx.drawImage(loaded.img, 0, 0, width, height);
  const outBase64 = await exportBase64("image/jpeg", quality);
  return {
    imageBase64: outBase64,
    imageType: "image/jpeg",
  };
}

export function mergeTools<
  T extends Tool | DialogueTool | LanguageModelV2FunctionTool
>(tools1: T[], tools2: T[]): T[] {
  let tools: T[] = [];
  let toolMap2 = tools2.reduce((map, tool) => {
    map[tool.name] = tool;
    return map;
  }, {} as Record<string, T>);
  let names = [];
  for (let i = 0; i < tools1.length; i++) {
    let tool1 = tools1[i];
    let tool2 = toolMap2[tool1.name];
    if (tool2) {
      tools.push(tool2);
      delete toolMap2[tool1.name];
    } else {
      tools.push(tool1);
    }
  }
  for (let i = 0; i < tools2.length; i++) {
    let tool2 = tools2[i];
    if (toolMap2[tool2.name] && names.indexOf(tool2.name) === -1) {
      tools.push(tool2);
      names.push(tool2.name);
    }
  }
  return tools;
}

export function mergeAgents(agents1: Agent[], agents2: Agent[]): Agent[] {
  let agents: Agent[] = [];
  let agentMap2 = agents2.reduce((map, agent) => {
    map[agent.Name] = agent;
    return map;
  }, {} as Record<string, Agent>);
  for (let i = 0; i < agents1.length; i++) {
    let agent1 = agents1[i];
    let agent2 = agentMap2[agent1.Name];
    if (agent2) {
      agents.push(agent2);
      delete agentMap2[agent1.Name];
    } else {
      agents.push(agent1);
    }
  }
  for (let i = 0; i < agents2.length; i++) {
    let agent2 = agents2[i];
    if (agentMap2[agent2.Name]) {
      agents.push(agent2);
    }
  }
  return agents;
}

export function sub(
  str: string,
  maxLength: number,
  appendPoint: boolean = true,
  showTruncated: boolean = true
): string {
  if (!str) {
    return "";
  }
  if (str.length > maxLength) {
    const truncatedLength = str.length - maxLength;
    // return str.substring(0, maxLength) + (appendPoint ? showTruncated ? `...(truncated: +${truncatedLength} chars)` : "..." : "");
    return (
      Array.from(str).slice(0, maxLength).join("") +
      (appendPoint
        ? showTruncated
          ? `...(truncated: +${truncatedLength} chars)`
          : "..."
        : "")
    );
  }
  return str;
}

export function fixJson(code: string) {
  if (!code) {
    return {};
  }
  try {
    return JSON.parse(code);
  } catch (e) {}
  try {
    return JSON.parse(code + '"}');
  } catch (e) {}
  const stack: string[] = [];
  for (let i = 0; i < code.length; i++) {
    let s = code[i];
    if (s === "{") {
      stack.push("}");
    } else if (s === "}") {
      stack.pop();
    } else if (s === "[") {
      stack.push("]");
    } else if (s === "]") {
      stack.pop();
    } else if (s === '"') {
      if (stack[stack.length - 1] === '"') {
        stack.pop();
      } else {
        stack.push('"');
      }
    }
  }
  const missingParts = [];
  while (stack.length > 0) {
    missingParts.push(stack.pop());
  }
  let json = code + missingParts.join("");
  try {
    return JSON.parse(json);
  } catch (e) {
    return {};
  }
}

export function fixXmlTag(code: string) {
  code = code.trim();
  if (code.endsWith("<")) {
    code = code.substring(0, code.length - 1);
  }
  if (code.indexOf("&") > -1) {
    code = code.replace(/&(?![a-zA-Z0-9#]+;)/g, "&amp;");
  }
  function fixDoubleChar(code: string) {
    const stack: string[] = [];
    for (let i = 0; i < code.length; i++) {
      let s = code[i];
      if (s === "<") {
        stack.push(">");
      } else if (s === ">") {
        stack.pop();
      } else if (s === '"') {
        if (stack[stack.length - 1] === '"') {
          stack.pop();
        } else {
          stack.push('"');
        }
      }
    }
    const missingParts = [];
    while (stack.length > 0) {
      missingParts.push(stack.pop());
    }
    return code + missingParts.join("");
  }
  let eIdx = code.lastIndexOf(" ");
  let endStr = eIdx > -1 ? code.substring(eIdx + 1) : "";
  if (code.endsWith("=")) {
    code += '""';
  } else if (
    endStr == "name" ||
    endStr == "id" ||
    endStr == "depen" ||
    endStr == "depends" ||
    endStr == "dependsOn" ||
    endStr == "input" ||
    endStr == "output" ||
    endStr == "items" ||
    endStr == "event" ||
    endStr == "loop"
  ) {
    let idx1 = code.lastIndexOf(">");
    let idx2 = code.lastIndexOf("<");
    if (idx1 < idx2 && code.lastIndexOf(" ") > idx2) {
      code += '=""';
    }
  }
  code = fixDoubleChar(code);
  const stack: string[] = [];
  function isSelfClosing(tag: string) {
    return tag.endsWith("/>");
  }
  for (let i = 0; i < code.length; i++) {
    let s = code[i];
    if (s === "<") {
      const isEndTag = code[i + 1] === "/";
      let endIndex = code.indexOf(">", i);
      let tagContent = code.slice(i, endIndex + 1);
      if (isSelfClosing(tagContent)) {
      } else if (isEndTag) {
        stack.pop();
      } else {
        stack.push(tagContent);
      }
      if (endIndex == -1) {
        break;
      }
      i = endIndex;
    }
  }
  const missingParts = [];
  while (stack.length > 0) {
    const top = stack.pop() as string;
    if (top.startsWith("<")) {
      let arr = top.match(/<(\w+)/) as string[];
      if (arr) {
        const tagName = arr[1];
        missingParts.push(`</${tagName}>`);
      }
    } else {
      missingParts.push(top);
    }
  }
  let completedCode = code + missingParts.join("");
  return completedCode;
}

export async function loadPackage(packageName: string): Promise<any> {
  // @ts-ignore
  if (typeof require !== "undefined") {
    try {
      return await import(packageName);
    } catch {
      // @ts-ignore
      return require(packageName);
    }
  }
  return await import(packageName);
}
