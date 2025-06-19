import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../core/context";
import { Tool, ToolResult } from "../types/tools.types";
import { ActionExecutor } from "../agent/browser/action_executor";
import { extractAgentXmlNode } from "../common/xml";
import { parseWorkflow } from "../common/xml";
import { WorkflowTextNode, BrowserAction } from "../types/core.types";

export const TOOL_NAME = "execute_action_block";

/**
 * Tool that executes action blocks for workflow nodes
 * This tool is automatically added when the workflow contains action blocks
 */
export default class ActionBlockTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;
  private actionExecutor?: ActionExecutor;

  constructor() {
    this.description = `Execute a structured action block for a workflow node. Use this when a node has specific selector-based actions defined.`;
    this.parameters = {
      type: "object",
      properties: {
        nodeId: {
          type: "number",
          description: "The ID of the node to execute"
        },
        fallbackReason: {
          type: "string",
          description: "If retrying after failure, describe what failed"
        }
      },
      required: ["nodeId"]
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    const nodeId = args.nodeId as number;
    const fallbackReason = args.fallbackReason as string | undefined;

    // Get the node from the workflow
    const agentNode = agentContext.agentChain.agent;
    const nodeElement = extractAgentXmlNode(agentNode.xml, nodeId);

    if (!nodeElement) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }

    // Parse the node to check for action block
    const nodeXml = nodeElement.toString();
    const actionMatch = nodeXml.match(/<action[^>]*>([\s\S]*?)<\/action>/);

    if (!actionMatch) {
      return {
        content: [{
          type: "text",
          text: `Node ${nodeId} does not have an action block. Use standard tools to execute it.`
        }]
      };
    }

    // Parse the action
    const action = this.parseActionFromXml(nodeElement);

    if (!action) {
      return {
        content: [{
          type: "text",
          text: `Failed to parse action block for node ${nodeId}`
        }]
      };
    }

    // Get the browser agent (assuming it's the current agent)
    const browserAgent = agentContext.agent;

    // Initialize action executor if needed
    if (!this.actionExecutor) {
      this.actionExecutor = new ActionExecutor(browserAgent);
    }

    try {
      // Try to execute the action
      await this.actionExecutor.execute(action, agentContext);

      // Build detailed success message
      let successDetails = `Successfully executed action '${action.type}' for node ${nodeId}.\n`;
      
      switch (action.type) {
        case "browser.click":
          successDetails += `Clicked element with selectors: CSS="${action.selector?.css || 'none'}", XPath="${action.selector?.xpath || 'none'}". `;
          successDetails += `Page changes were detected after click.`;
          break;
        case "browser.input":
          successDetails += `Set input value to: "${action.value}". `;
          successDetails += `Value was verified to be correctly set.`;
          break;
        case "browser.navigate":
          if (action.url) {
            successDetails += `Navigated to: ${action.url}. `;
            successDetails += `Navigation was verified successful.`;
          } else {
            successDetails += `Executed browser back command successfully.`;
          }
          break;
        default:
          successDetails += `Action completed successfully.`;
      }

      return {
        content: [{
          type: "text",
          text: successDetails
        }]
      };
    } catch (error: any) {
      // Action failed, provide context for LLM fallback
      const errorDetails = error.message || error.toString();
      
      // Analyze the error to provide better guidance
      let guidance = "";
      let severity = "failed";
      
      if (errorDetails.includes("autocomplete_triggered") || errorDetails.includes("suggestions:")) {
        severity = "partial_success";
        guidance = "The input action triggered autocomplete/suggestions. Check if the expected options appeared and click on the appropriate suggestion to complete the action.";
      } else if (errorDetails.includes("dropdown detected")) {
        severity = "partial_success"; 
        guidance = "A dropdown was detected after the input. Look for and click on the relevant option from the dropdown.";
      } else if (errorDetails.includes("minimal page changes")) {
        severity = "uncertain";
        guidance = "The click may have worked but produced subtle changes. Check if the intended effect occurred (e.g., form state changes, focus changes, etc.).";
      } else if (errorDetails.includes("Input action may not have achieved intended effect")) {
        severity = "partial_success";
        guidance = "The input was typed but verification failed. Check if autocomplete suggestions appeared or if the form state changed as expected.";
      } else {
        guidance = "Please complete this step using alternative methods.";
      }

      return {
        content: [{
          type: "text",
          text: `Action execution ${severity} for node ${nodeId}. Error: ${errorDetails}\n\n${guidance} The intended action was '${action.type}' with selectors: ${JSON.stringify(action.selector)}`
        }],
        isError: true
      };
    }
  }

  private parseActionFromXml(nodeElement: Element): BrowserAction | null {
    const actionElements = nodeElement.getElementsByTagName("action");
    if (actionElements.length === 0) return null;

    const actionElement = actionElements[0];
    const action: BrowserAction = {
      type: actionElement.getAttribute("type") || "",
    };

    // Parse selector
    const selectorElements = actionElement.getElementsByTagName("selector");
    if (selectorElements.length > 0) {
      const selectorElement = selectorElements[0];
      action.selector = {
        css: selectorElement.getAttribute("css") || undefined,
        xpath: selectorElement.getAttribute("xpath") || undefined,
      };
    }

    // Parse value
    const valueElements = actionElement.getElementsByTagName("value");
    if (valueElements.length > 0) {
      action.value = valueElements[0].textContent || undefined;
    }

    // Parse other properties
    const urlElements = actionElement.getElementsByTagName("url");
    if (urlElements.length > 0) {
      action.url = urlElements[0].textContent || undefined;
    }

    const keyElements = actionElement.getElementsByTagName("key");
    if (keyElements.length > 0) {
      action.key = keyElements[0].textContent || undefined;
    }

    const commandElements = actionElement.getElementsByTagName("command");
    if (commandElements.length > 0) {
      action.command = commandElements[0].textContent || undefined;
    }

    return action;
  }
}

export { ActionBlockTool };
