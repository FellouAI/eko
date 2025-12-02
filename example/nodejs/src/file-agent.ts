import { glob } from "glob";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { Tool, ToolResult, IMcpClient } from "@eko-ai/eko/types";
import { config, Agent, AgentContext, mergeTools, sub } from "@eko-ai/eko";

export const AGENT_NAME = "File";

export default class FileAgent extends Agent {
  constructor(
    work_path?: string,
    llms?: string[],
    ext_tools?: Tool[],
    mcpClient?: IMcpClient,
    planDescription?: string
  ) {
    const _tools_ = [] as Tool[];
    const prompt = work_path
      ? `Your default working path is: ${work_path}`
      : "";
    super({
      name: AGENT_NAME,
      description: `You are a file agent, handling file-related tasks such as creating, finding, reading, modifying files, etc.${prompt}`,
      tools: _tools_,
      llms: llms,
      mcpClient: mcpClient,
      planDescription:
        planDescription ||
        "File operation agent, handling file-related tasks such as creating, finding, reading, modifying files, etc, only text file writing is supported.",
    });
    let init_tools = this.buildInitTools();
    if (ext_tools && ext_tools.length > 0) {
      init_tools = mergeTools(init_tools, ext_tools);
    }
    init_tools.forEach((tool) => _tools_.push(tool));
  }

  protected async do_file_read(
    agentContext: AgentContext,
    path: string,
    write_variable: string
  ): Promise<{ file_context: string; write_variable?: string }> {
    let file_context = await this.file_read(agentContext, path);
    if (file_context && file_context.length > config.fileTextMaxLength) {
      file_context = sub(file_context, config.fileTextMaxLength, true);
    }
    if (write_variable) {
      agentContext.context.variables.set(write_variable, file_context);
    }
    return {
      file_context: file_context,
      write_variable: write_variable,
    };
  }

  protected async do_file_write(
    agentContext: AgentContext,
    path: string,
    append: boolean,
    content?: string,
    from_variable?: string
  ): Promise<any> {
    if (content == null && from_variable == null) {
      throw new Error(
        `content and from_variable cannot be both empty, cannot write to file ${path}`
      );
    }
    if (from_variable) {
      let variable_value =
        agentContext.context.variables.get(from_variable) || "";
      if (variable_value) {
        content = variable_value;
      }
      if (!content) {
        throw new Error(
          `Variable ${from_variable} is empty, cannot write to file ${path}`
        );
      }
    }
    if (!content) {
      throw new Error(`content is empty, cannot write to file ${path}`);
    }
    return await this.file_write(agentContext, path, content || "", append);
  }

  protected async file_list(
    agentContext: AgentContext,
    directoryPath: string
  ): Promise<
    Array<{
      path: string;
      name?: string;
      isDirectory?: boolean;
      size?: string;
      modified?: string;
    }>
  > {
    const files = await fs.readdir(directoryPath);
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(directoryPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          isDirectory: stats.isDirectory(),
          size: this.formatFileSize(stats.size),
          modified: stats.mtime.toLocaleString(),
        };
      })
    );
    return fileDetails;
  }

  protected async file_read(
    agentContext: AgentContext,
    filePath: string
  ): Promise<string> {
    return await fs.readFile(filePath, "utf-8");
  }

  protected async file_write(
    agentContext: AgentContext,
    filePath: string,
    content: string,
    append: boolean
  ): Promise<any> {
    const directory = path.dirname(filePath);
    await fs.mkdir(directory, { recursive: true });
    if (append) {
      await fs.appendFile(filePath, content, "utf-8");
    } else {
      await fs.writeFile(filePath, content, "utf-8");
    }
  }

  protected async file_str_replace(
    agentContext: AgentContext,
    filePath: string,
    oldStr: string,
    newStr: string
  ): Promise<any> {
    let content = await fs.readFile(filePath, "utf-8");
    const originalContent = content;
    content = content.replace(new RegExp(oldStr, "g"), newStr);
    if (content === originalContent) {
      return;
    }
    await fs.writeFile(filePath, content, "utf-8");
  }

  protected async file_find_by_name(
    agentContext: AgentContext,
    directoryPath: string,
    globPattern: string
  ): Promise<
    Array<{
      path: string;
      name?: string;
      isDirectory?: boolean;
      size?: string;
      modified?: string;
    }>
  > {
    const pattern = path.join(directoryPath, globPattern);
    const files = await glob.glob(pattern);
    const fileDetails = await Promise.all(
      files.map(async (file: string) => {
        const stats = await fs.stat(file);
        return {
          name: path.basename(file),
          path: file,
          isDirectory: stats.isDirectory(),
          size: this.formatFileSize(stats.size),
          modified: stats.mtime.toLocaleString(),
        };
      })
    );
    return fileDetails;
  }

  protected handlePath(filePath: string): string {
    if (filePath && filePath.startsWith("~")) {
      filePath = path.join(os.homedir(), filePath.substring(1));
    }
    return filePath;
  }

  protected formatFileSize(size: number): string {
    if (size < 1024) {
      return size + " B";
    }
    if (size < 1024 * 1024) {
      return (size / 1024).toFixed(1) + " KB";
    }
    return (size / 1024 / 1024).toFixed(1) + " MB";
  }

  private buildInitTools(): Tool[] {
    return [
      {
        name: "file_list",
        description: "Getting a list of files in a specified directory.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File directory path",
            },
          },
          required: ["path"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_list(agentContext, this.handlePath(args.path as string))
          );
        },
      },
      {
        name: "file_read",
        description:
          "Read file content. Use to read files or check file content.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path",
            },
            write_variable: {
              type: "string",
              description:
                "Variable name, the content after reading is simultaneously written to the variable, facilitating direct loading from the variable in subsequent operations.",
            },
          },
          required: ["path"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.do_file_read(
              agentContext,
              this.handlePath(args.path as string),
              args.write_variable as string
            )
          );
        },
      },
      {
        name: "file_write",
        description:
          "Overwrite or append content to a file. Use for creating new files, appending content, or modifying existing files, only supports txt/md/json/csv or other text formats.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path",
            },
            append: {
              type: "boolean",
              description: "(Optional) Whether to use append mode",
              default: false,
            },
            content: {
              type: "string",
              description: "Text content, write content directly to the file.",
            },
            from_variable: {
              type: "string",
              description:
                "Variable name, read content from the variable and write it.",
            },
          },
          required: ["path"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.do_file_write(
              agentContext,
              this.handlePath(args.path as string),
              (args.append || false) as boolean,
              args.content as string,
              args.from_variable as string
            )
          );
        },
      },
      {
        name: "file_str_replace",
        description:
          "Replace specified string in a file. Use for updating specific content in files.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path",
            },
            old_str: {
              type: "string",
              description: "Original string to be replaced",
            },
            new_str: {
              type: "string",
              description: "New string to replace with",
            },
          },
          required: ["path", "old_str", "new_str"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_str_replace(
              agentContext,
              this.handlePath(args.path as string),
              args.old_str as string,
              args.new_str as string
            )
          );
        },
      },
      {
        name: "file_find_by_name",
        description:
          "Find files by name pattern in specified directory. Use for locating files with specific naming patterns.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path of directory to search",
            },
            glob: {
              type: "string",
              description:
                "Filename pattern using glob syntax wildcards, Example: **/*.txt",
            },
          },
          required: ["path", "glob"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_find_by_name(
              agentContext,
              this.handlePath(args.path as string),
              args.glob as string
            )
          );
        },
      },
    ];
  }
}

export { FileAgent };
