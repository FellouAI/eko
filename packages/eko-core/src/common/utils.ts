import { LanguageModelV1FunctionTool } from "@ai-sdk/provider";
import { Tool, ToolSchema } from "../types/tools.types";
import { Agent } from "../agent";

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
): LanguageModelV1FunctionTool {
  if ("function" in tool) {
    return {
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    };
  } else if ("input_schema" in tool) {
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    };
  } else if ("inputSchema" in tool) {
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    };
  } else {
    return {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    };
  }
}

export function toImage(imageData: string): Uint8Array | URL {
  let image: Uint8Array | URL | null = null;
  if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
    image = new URL(imageData);
  } else {
    if (imageData.startsWith("data:image/")) {
      imageData = imageData.substring(imageData.indexOf(",") + 1);
    }
    // @ts-ignore
    if (typeof Buffer != "undefined") {
      // @ts-ignore
      const buffer = Buffer.from(imageData, "base64");
      image = new Uint8Array(buffer);
    } else {
      const binaryString = atob(imageData);
      image = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        image[i] = binaryString.charCodeAt(i);
      }
    }
  }
  return image;
}

export function mergeTools<T extends Tool | LanguageModelV1FunctionTool>(tools1: T[], tools2: T[]): T[] {
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
  let tools: Agent[] = [];
  let toolMap2 = agents2.reduce((map, tool) => {
    map[tool.Name] = tool;
    return map;
  }, {} as Record<string, Agent>);
  for (let i = 0; i < agents1.length; i++) {
    let tool1 = agents1[i];
    let tool2 = toolMap2[tool1.Name];
    if (tool2) {
      tools.push(tool2);
      delete toolMap2[tool1.Name];
    } else {
      tools.push(tool1);
    }
  }
  for (let i = 0; i < agents2.length; i++) {
    let tool2 = agents2[i];
    if (toolMap2[tool2.Name]) {
      tools.push(tool2);
    }
  }
  return tools;
}

export function sub(
  str: string,
  maxLength: number,
  appendPoint: boolean = true
): string {
  if (!str) {
    return "";
  }
  if (str.length > maxLength) {
    return str.substring(0, maxLength) + (appendPoint ? "..." : "");
  }
  return str;
}

/**
 * Replace template variables in a string with actual values
 * Template variables are in the format {variable_name}
 * @param template - The template string containing {variable} placeholders
 * @param variables - Object containing variable names and their values
 * @returns The string with all template variables replaced
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, any>
): string {
  if (!template || !variables) {
    return template;
  }

  // Replace all occurrences of {variable_name} with the corresponding value
  return template.replace(/\{([^}]+)\}/g, (match, variableName) => {
    const value = variables[variableName.trim()];
    // If variable is undefined, keep the original placeholder
    if (value === undefined) {
      return match;
    }
    // Convert value to string
    return String(value);
  });
}

export function fixXmlTag(code: string) {
  if (code.indexOf('&') > -1) {
    code = code.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;');
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
      const tagName = arr[1];
      missingParts.push(`</${tagName}>`);
    } else {
      missingParts.push(top);
    }
  }
  let completedCode = code + missingParts.join("");
  return completedCode;
}
