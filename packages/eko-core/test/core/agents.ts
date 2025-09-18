import { AgentContext } from "../../src";
import { BaseBrowserLabelsAgent, BaseComputerAgent, BaseFileAgent } from "../../src/agent";

export class SimpleBrowserAgent extends BaseBrowserLabelsAgent {
  protected screenshot(agentContext: AgentContext): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png"; }> {
    throw new Error("Method not implemented.");
  }
  protected navigate_to(agentContext: AgentContext, url: string): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected execute_script(agentContext: AgentContext, func: (...args: any[]) => void, args: any[]): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected get_all_tabs(agentContext: AgentContext): Promise<Array<{ tabId: number; url: string; title: string; }>> {
    throw new Error("Method not implemented.");
  }
  protected switch_tab(agentContext: AgentContext, tabId: number): Promise<{ tabId: number; url: string; title: string; }> {
    throw new Error("Method not implemented.");
  }
}

export class SimpleComputerAgent extends BaseComputerAgent {
  protected screenshot(agentContext: AgentContext): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png"; }> {
    throw new Error("Method not implemented.");
  }
  protected typing(agentContext: AgentContext, text: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected click(agentContext: AgentContext, x: number, y: number, num_clicks: number, button_type: "left" | "right" | "middle"): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected scroll(agentContext: AgentContext, amount: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected move_to(agentContext: AgentContext, x: number, y: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected press(agentContext: AgentContext, key: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected hotkey(agentContext: AgentContext, keys: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  protected drag_and_drop(agentContext: AgentContext, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

export class SimpleFileAgent extends BaseFileAgent {
  protected file_list(agentContext: AgentContext, path: string): Promise<Array<{ path: string; name?: string; isDirectory?: boolean; size?: string; modified?: string; }>> {
    throw new Error("Method not implemented.");
  }
  protected file_read(agentContext: AgentContext, path: string): Promise<string> {
    throw new Error("Method not implemented.");
  }
  protected file_write(agentContext: AgentContext, path: string, content: string, append: boolean): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected file_str_replace(agentContext: AgentContext, path: string, old_str: string, new_str: string): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected file_find_by_name(agentContext: AgentContext, path: string, glob: string): Promise<Array<{ path: string; name?: string; isDirectory?: boolean; size?: string; modified?: string; }>> {
    throw new Error("Method not implemented.");
  }
}