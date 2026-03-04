/**
 * Noda Tools Index
 * Export all Noda VR mind mapping tools
 */

// Node tools
export { NodaCreateNodeTool } from "./create-node";
export { NodaUpdateNodeTool } from "./update-node";
export { NodaDeleteNodeTool } from "./delete-node";
export { NodaListNodesTool } from "./list-nodes";

// Link tools
export { NodaCreateLinkTool } from "./create-link";
export { NodaUpdateLinkTool } from "./update-link";
export { NodaDeleteLinkTool } from "./delete-link";
export { NodaListLinksTool } from "./list-links";

// Utility tools
export { NodaGetUserTool } from "./get-user";
export { NodaBuildMindmapTool } from "./build-mindmap";

// Re-export tool names for convenience
export { TOOL_NAME as NODA_CREATE_NODE } from "./create-node";
export { TOOL_NAME as NODA_UPDATE_NODE } from "./update-node";
export { TOOL_NAME as NODA_DELETE_NODE } from "./delete-node";
export { TOOL_NAME as NODA_LIST_NODES } from "./list-nodes";
export { TOOL_NAME as NODA_CREATE_LINK } from "./create-link";
export { TOOL_NAME as NODA_UPDATE_LINK } from "./update-link";
export { TOOL_NAME as NODA_DELETE_LINK } from "./delete-link";
export { TOOL_NAME as NODA_LIST_LINKS } from "./list-links";
export { TOOL_NAME as NODA_GET_USER } from "./get-user";
export { TOOL_NAME as NODA_BUILD_MINDMAP } from "./build-mindmap";

import { Tool } from "../../types/tools.types";
import { NodaCreateNodeTool } from "./create-node";
import { NodaUpdateNodeTool } from "./update-node";
import { NodaDeleteNodeTool } from "./delete-node";
import { NodaListNodesTool } from "./list-nodes";
import { NodaCreateLinkTool } from "./create-link";
import { NodaUpdateLinkTool } from "./update-link";
import { NodaDeleteLinkTool } from "./delete-link";
import { NodaListLinksTool } from "./list-links";
import { NodaGetUserTool } from "./get-user";
import { NodaBuildMindmapTool } from "./build-mindmap";

/**
 * Get all Noda tools as an array
 * Useful for registering all tools with an agent
 */
export function getAllNodaTools(): Tool[] {
  return [
    new NodaCreateNodeTool(),
    new NodaUpdateNodeTool(),
    new NodaDeleteNodeTool(),
    new NodaListNodesTool(),
    new NodaCreateLinkTool(),
    new NodaUpdateLinkTool(),
    new NodaDeleteLinkTool(),
    new NodaListLinksTool(),
    new NodaGetUserTool(),
    new NodaBuildMindmapTool(),
  ];
}
