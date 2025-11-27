import { AgentContext } from "../../src";
import { Agent, BaseBrowserLabelsAgent } from "../../src/agent";

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

export class SimpleComputerAgent extends Agent {
  constructor() {
    super({
      name: "Computer",
      description: "A simple computer agent",
      tools: [],
    });
  }
}

export class SimpleFileAgent extends Agent {
  constructor() {
    super({
      name: "File",
      description: "A simple file agent",
      tools: [],
    });
  }
}