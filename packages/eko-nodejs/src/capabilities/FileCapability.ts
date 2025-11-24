import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { AgentContext, FileCapability as BaseFileCapability } from "@eko-ai/eko";

/**
 * File capability implementation for Node.js environment
 * 
 * Uses Node.js fs/promises for file operations.
 */
export class FileCapability extends BaseFileCapability {
  constructor(work_path?: string) {
    super(work_path);
  }

  /**
   * List files in a directory
   */
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

  /**
   * Read file content
   */
  protected async file_read(
    agentContext: AgentContext,
    filePath: string
  ): Promise<string> {
    return await fs.readFile(filePath, "utf-8");
  }

  /**
   * Write content to a file
   */
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

  /**
   * Replace string in a file
   */
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

  /**
   * Find files by name pattern using glob
   */
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
      files.map(async (file) => {
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

  /**
   * Format file size for display
   */
  protected formatFileSize(size: number): string {
    if (size < 1024) {
      return size + " B";
    }
    if (size < 1024 * 1024) {
      return (size / 1024).toFixed(1) + " KB";
    }
    return (size / 1024 / 1024).toFixed(1) + " MB";
  }
}

