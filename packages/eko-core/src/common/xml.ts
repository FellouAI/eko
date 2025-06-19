import { fixXmlTag, replaceTemplateVariables } from "./utils";
import { DOMParser, XMLSerializer } from "xmldom";
import {
  Workflow,
  WorkflowAgent,
  WorkflowForEachNode,
  WorkflowNode,
  WorkflowTextNode,
  WorkflowWatchNode,
  WorkflowTemplate,
  TemplateVariable,
  BrowserAction,
} from "../types/core.types";

export function parseWorkflow(
  taskId: string,
  xml: string,
  done: boolean,
  templateVariables?: Record<string, any>
): Workflow | null {
  try {
    let sIdx = xml.indexOf("<root>");
    if (sIdx == -1) {
      return null;
    }
    xml = xml.substring(sIdx);
    let eIdx = xml.indexOf("</root>");
    if (eIdx > -1) {
      xml = xml.substring(0, eIdx + 7);
    }
    if (!done) {
      xml = fixXmlTag(xml);
    }

    // Replace template variables if provided
    if (templateVariables) {
      xml = replaceTemplateVariables(xml, templateVariables);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    let root = doc.documentElement;
    if (root.tagName !== "root") {
      return null;
    }

    // Parse template metadata
    let template: WorkflowTemplate | undefined;
    let templateNodes = root.getElementsByTagName("template");
    if (templateNodes.length > 0) {
      template = parseTemplateMetadata(templateNodes[0]);
    }

    let agents: WorkflowAgent[] = [];
    const workflow: Workflow = {
      taskId: taskId,
      name: root.getElementsByTagName("name")[0]?.textContent || "",
      thought: root.getElementsByTagName("thought")[0]?.textContent || "",
      agents: agents,
      xml: xml,
      template: template,
    };
    let agentsNode = root.getElementsByTagName("agents");
    let agentsNodes =
      agentsNode.length > 0 ? agentsNode[0].getElementsByTagName("agent") : [];
    for (let i = 0; i < agentsNodes.length; i++) {
      let agentNode = agentsNodes[i];
      let name = agentNode.getAttribute("name");
      if (!name) {
        break;
      }
      let nodes: WorkflowNode[] = [];
      let agent: WorkflowAgent = {
        name: name,
        id: taskId + "-" + (i < 10 ? "0" + i : i),
        task: agentNode.getElementsByTagName("task")[0]?.textContent || "",
        nodes: nodes,
        xml: agentNode.toString(),
        sequentialMode: undefined, // Will be set after parsing nodes
      };
      let xmlNodes = agentNode.getElementsByTagName("nodes");
      if (xmlNodes.length > 0) {
        parseWorkflowNodes(nodes, xmlNodes[0].childNodes);
      }
      
      // Check if sequentialMode is explicitly set in XML
      const explicitSequentialMode = agentNode.getAttribute("sequentialMode");
      if (explicitSequentialMode !== null && explicitSequentialMode !== '') {
        agent.sequentialMode = explicitSequentialMode === "true";
      } else {
        // Default: enable sequential mode if any nodes have action blocks
        agent.sequentialMode = nodes.some(node => 
          node.type === 'normal' && node.action !== undefined
        );
      }
      
      agents.push(agent);
    }
    return workflow;
  } catch (e) {
    if (done) {
      throw e;
    } else {
      return null;
    }
  }
}

function parseTemplateMetadata(templateNode: Element): WorkflowTemplate {
  const version = templateNode.getAttribute("version") || "1.0";
  const variables: TemplateVariable[] = [];

  const variablesNode = templateNode.getElementsByTagName("variables");
  if (variablesNode.length > 0) {
    const variableNodes = variablesNode[0].getElementsByTagName("variable");
    for (let i = 0; i < variableNodes.length; i++) {
      const varNode = variableNodes[i];
      const variable: TemplateVariable = {
        name: varNode.getAttribute("name") || "",
        type: varNode.getAttribute("type") || "string",
        required: varNode.getAttribute("required") === "true",
        description: varNode.getAttribute("description") || undefined,
      };
      variables.push(variable);
    }
  }

  return {
    version,
    variables,
  };
}

function parseWorkflowNodes(
  nodes: WorkflowNode[],
  xmlNodes: NodeListOf<ChildNode> | HTMLCollectionOf<Element>
) {
  for (let i = 0; i < xmlNodes.length; i++) {
    if (xmlNodes[i].nodeType !== 1) {
      continue;
    }
    let xmlNode = xmlNodes[i] as Element;
    switch (xmlNode.tagName) {
      case "node": {
        let node: WorkflowTextNode = {
          type: "normal",
          text: "",
          input: xmlNode.getAttribute("input"),
          output: xmlNode.getAttribute("output"),
        };

        // Check for executionMode attribute
        const executionMode = xmlNode.getAttribute("executionMode");
        if (executionMode === "deterministic" || executionMode === "agent") {
          node.executionMode = executionMode;
        }

        // Parse action element if present
        const actionElements = xmlNode.getElementsByTagName("action");
        if (actionElements.length > 0) {
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

          // Parse other action properties
          const valueElements = actionElement.getElementsByTagName("value");
          if (valueElements.length > 0) {
            action.value = valueElements[0].textContent || undefined;
          }

          const screenshotElements = actionElement.getElementsByTagName("screenshot");
          if (screenshotElements.length > 0) {
            action.screenshot = screenshotElements[0].textContent || undefined;
          }

          const urlElements = actionElement.getElementsByTagName("url");
          if (urlElements.length > 0) {
            action.url = urlElements[0].textContent || undefined;
          }

          const commandElements = actionElement.getElementsByTagName("command");
          if (commandElements.length > 0) {
            action.command = commandElements[0].textContent || undefined;
          }

          const keyElements = actionElement.getElementsByTagName("key");
          if (keyElements.length > 0) {
            action.key = keyElements[0].textContent || undefined;
          }

          // Parse fields for extraction
          const fieldsElements = actionElement.getElementsByTagName("fields");
          if (fieldsElements.length > 0) {
            const fieldElements = fieldsElements[0].getElementsByTagName("field");
            action.fields = [];
            for (let j = 0; j < fieldElements.length; j++) {
              const fieldElement = fieldElements[j];
              action.fields.push({
                name: fieldElement.getAttribute("name") || "",
                selector: fieldElement.getAttribute("selector") || "",
              });
            }
          }

          node.action = action;
        }

        // Get text content excluding action element
        let textContent = "";
        for (let j = 0; j < xmlNode.childNodes.length; j++) {
          const childNode = xmlNode.childNodes[j];
          if (childNode.nodeType === 3) { // Text node
            textContent += childNode.textContent || "";
          }
        }
        node.text = textContent.trim();

        nodes.push(node);
        break;
      }
      case "forEach": {
        let _nodes: WorkflowNode[] = [];
        let node: WorkflowForEachNode = {
          type: "forEach",
          items: (xmlNode.getAttribute("items") || "list") as any,
          nodes: _nodes,
        };
        let _xmlNodes = xmlNode.getElementsByTagName("node");
        if (_xmlNodes.length > 0) {
          parseWorkflowNodes(_nodes, _xmlNodes);
        }
        nodes.push(node);
        break;
      }
      case "watch": {
        let _nodes: (WorkflowTextNode | WorkflowForEachNode)[] = [];
        let node: WorkflowWatchNode = {
          type: "watch",
          event: (xmlNode.getAttribute("event") || "") as any,
          loop: xmlNode.getAttribute("loop") == "true",
          description:
            xmlNode.getElementsByTagName("description")[0]?.textContent || "",
          triggerNodes: _nodes,
        };
        let triggerNode = xmlNode.getElementsByTagName("trigger");
        if (triggerNode.length > 0) {
          parseWorkflowNodes(_nodes, triggerNode[0].childNodes);
        }
        nodes.push(node);
        break;
      }
    }
  }
}

export function buildAgentRootXml(
  agentXml: string,
  mainTaskPrompt: string,
  nodeCallback: (nodeId: number, node: Element) => void,
  templateVariables?: Record<string, any>
) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(agentXml, "text/xml");
  let agentNode = doc.getElementsByTagName("agent");
  let nodesNode = doc.getElementsByTagName("nodes");
  if (nodesNode.length > 0) {
    let nodes = nodesNode[0].childNodes;
    let nodeId = 0;
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i] as any;
      if (node.nodeType == 1) {
        node.setAttribute("id", nodeId + "");
        nodeCallback && nodeCallback(nodeId, node);
        nodeId++;
      }
    }
  }
  // <root><mainTask></mainTask><currentTask></currentTask><nodes><node id="0"></node></nodes></root>
  let agentInnerHTML = getInnerXML(agentNode[0]);
  let prefix = agentInnerHTML.substring(0, agentInnerHTML.indexOf("<task>"));
  agentInnerHTML = agentInnerHTML
    .replace("<task>", "<currentTask>")
    .replace("</task>", "</currentTask>");
  let xmlPrompt = `<root>${prefix}<mainTask>${mainTaskPrompt}</mainTask>${agentInnerHTML}</root>`;
  xmlPrompt = xmlPrompt.replace(/      /g, "  ").replace('    </root>', '</root>');

  // Apply template variables if provided
  if (templateVariables) {
    xmlPrompt = replaceTemplateVariables(xmlPrompt, templateVariables);
  }

  return xmlPrompt;
}

export function extractAgentXmlNode(
  agentXml: string,
  nodeId: number
): Element | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(agentXml, "text/xml");
  let nodesNode = doc.getElementsByTagName("nodes");
  if (nodesNode.length > 0) {
    let nodes = nodesNode[0].childNodes;
    let _nodeId = 0;
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i] as any;
      if (node.nodeType == 1) {
        if (node.getAttribute("id") == null || node.getAttribute("id") == "") {
          node.setAttribute("id", _nodeId + "");
        }
        _nodeId++;
        if (node.getAttribute("id") == nodeId + "") {
          return node;
        }
      }
    }
  }
  return null;
}

export function getInnerXML(node: Element): string {
  let result = "";
  const serializer = new XMLSerializer();
  for (let i = 0; i < node.childNodes.length; i++) {
    result += serializer.serializeToString(node.childNodes[i]);
  }
  return result;
}

export function getOuterXML(node: Element): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(node);
}

/**
 * Extract template variables from XML without parsing
 * This is useful for checking what variables are needed before providing them
 */
export function extractTemplateVariables(xml: string): TemplateVariable[] {
  try {
    let sIdx = xml.indexOf("<root>");
    if (sIdx == -1) {
      return [];
    }
    xml = xml.substring(sIdx);
    let eIdx = xml.indexOf("</root>");
    if (eIdx > -1) {
      xml = xml.substring(0, eIdx + 7);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    let root = doc.documentElement;
    if (root.tagName !== "root") {
      return [];
    }

    let templateNodes = root.getElementsByTagName("template");
    if (templateNodes.length > 0) {
      const template = parseTemplateMetadata(templateNodes[0]);
      return template.variables;
    }

    return [];
  } catch (e) {
    return [];
  }
}

/**
 * Validate that all required template variables are provided
 * @returns Array of missing required variable names
 */
export function validateTemplateVariables(
  templateVariables: TemplateVariable[],
  providedVariables: Record<string, any>
): string[] {
  const missingVariables: string[] = [];

  for (const variable of templateVariables) {
    if (variable.required && !(variable.name in providedVariables)) {
      missingVariables.push(variable.name);
    }
  }

  return missingVariables;
}
