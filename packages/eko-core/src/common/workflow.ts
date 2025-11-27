import { WorkflowNode, WorkflowTextNode } from "../types";

export async function recursiveTextNode(
  node: WorkflowNode,
  callback: (textNode: WorkflowTextNode, parent: WorkflowNode) => Promise<void>
): Promise<void> {
  if (node.type === "normal") {
    callback(node, node);
  }
  if (node.type === "forEach") {
    node.nodes.map((item) => recursiveTextNode(item, callback));
  }
  if (node.type === "watch") {
    node.triggerNodes.map((triggerNode) =>
      recursiveTextNode(triggerNode, callback)
    );
  }
}
