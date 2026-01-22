/**
 * NodaAgent - Specialized agent for mind mapping in Noda VR
 *
 * This agent uses Noda's Web API to create, modify, and manage
 * 3D mind maps in virtual reality environments.
 */

import { Agent, AgentParams } from "../agent/base";
import { AgentContext } from "../agent/agent-context";
import { Tool } from "../types/tools.types";
import { getAllNodaTools } from "./tools";
import {
  NodaAPI,
  NodaNodeProperties,
  NodaLinkProperties,
  NodaMindMap,
  NodaEventHandlers,
} from "./types";

export interface NodaAgentParams extends Partial<AgentParams> {
  /** Custom name for the agent */
  name?: string;
  /** Custom description */
  description?: string;
  /** Additional tools to include */
  additionalTools?: Tool[];
  /** Event handlers for Noda events */
  eventHandlers?: NodaEventHandlers;
}

/**
 * NodaAgent - An AI agent specialized for creating and managing
 * VR mind maps using Noda's Web API
 */
export class NodaAgent extends Agent {
  private eventHandlers?: NodaEventHandlers;

  constructor(params: NodaAgentParams = {}) {
    const nodaTools = getAllNodaTools();
    const allTools = params.additionalTools
      ? [...nodaTools, ...params.additionalTools]
      : nodaTools;

    super({
      name: params.name || "NodaAgent",
      description:
        params.description ||
        `A specialized agent for creating and managing 3D mind maps in Noda VR.
This agent can:
- Create, update, and delete nodes (ideas/concepts) in the VR mind map
- Create, update, and delete links (relationships) between nodes
- Build complete mind maps from structured data
- Query and list existing nodes and links
- Customize appearance with colors, shapes, sizes, and animations

Use this agent for brainstorming, planning, visualizing concepts,
creating knowledge graphs, or any task that benefits from spatial thinking.`,
      tools: allTools,
      llms: params.llms,
      mcpClient: params.mcpClient,
      planDescription:
        params.planDescription ||
        `Use this agent when you need to:
- Create visual representations of ideas or concepts
- Build mind maps, concept maps, or knowledge graphs
- Organize information spatially in 3D
- Brainstorm and capture ideas visually
- Create project plans or storyboards
- Visualize relationships between concepts`,
      requestHandler: params.requestHandler,
    });

    this.eventHandlers = params.eventHandlers;
  }

  /**
   * Set up event handlers for Noda events
   */
  public setupEventHandlers(nodaApi: NodaAPI): void {
    if (!this.eventHandlers) return;

    if (this.eventHandlers.onNodeCreated) {
      nodaApi.onNodeCreated = this.eventHandlers.onNodeCreated;
    }
    if (this.eventHandlers.onNodeUpdated) {
      nodaApi.onNodeUpdated = this.eventHandlers.onNodeUpdated;
    }
    if (this.eventHandlers.onNodeDeleted) {
      nodaApi.onNodeDeleted = this.eventHandlers.onNodeDeleted;
    }
    if (this.eventHandlers.onLinkCreated) {
      nodaApi.onLinkCreated = this.eventHandlers.onLinkCreated;
    }
    if (this.eventHandlers.onLinkUpdated) {
      nodaApi.onLinkUpdated = this.eventHandlers.onLinkUpdated;
    }
    if (this.eventHandlers.onLinkDeleted) {
      nodaApi.onLinkDeleted = this.eventHandlers.onLinkDeleted;
    }
  }

  /**
   * Extended system prompt for mind mapping context
   */
  protected async extSysPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return `
## Mind Mapping Best Practices

When creating mind maps:
1. Start with a central/root node representing the main topic
2. Use descriptive titles that clearly convey each idea
3. Use colors consistently to group related concepts:
   - Similar ideas should have similar colors
   - Use contrasting colors for different categories
4. Position related nodes near each other in 3D space
5. Use link labels to describe relationships between concepts
6. Size nodes based on importance (larger = more important)
7. Use shapes to categorize nodes:
   - Ball: General concepts
   - Star: Key ideas or highlights
   - Box: Tasks or action items
   - Diamond: Decision points
   - Plus: Additional/supporting ideas

## Coordinate System
- X axis: Left (-) to Right (+)
- Y axis: Down (-) to Up (+)
- Z axis: Away (-) to Toward (+) the user

## Tips
- Create nodes before creating links between them
- Use the build_mindmap tool for creating complete structures efficiently
- Query existing nodes/links before making modifications
- Use meaningful UUIDs for nodes you'll reference later
`;
  }

  /**
   * Static helper to create a basic mind map structure
   */
  static createBasicMindMap(
    centralTopic: string,
    branches: Array<{
      title: string;
      color?: string;
      subnodes?: Array<{ title: string; color?: string }>;
    }>
  ): NodaMindMap {
    const nodes: NodaNodeProperties[] = [];
    const links: NodaLinkProperties[] = [];

    // Central node
    const centralId = "central";
    nodes.push({
      uuid: centralId,
      title: centralTopic,
      shape: "Star",
      size: 15,
      color: "#FFD700",
      location: { x: 0, y: 0, z: 0 },
    });

    // Create branches in a circular pattern
    const angleStep = (2 * Math.PI) / branches.length;
    const radius = 2;

    branches.forEach((branch, i) => {
      const branchId = `branch_${i}`;
      const angle = i * angleStep;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      nodes.push({
        uuid: branchId,
        title: branch.title,
        shape: "Ball",
        size: 10,
        color: branch.color || this.getDefaultColor(i),
        location: { x, y: 0, z },
      });

      links.push({
        fromUuid: centralId,
        toUuid: branchId,
        shape: "Solid",
        size: 2,
      });

      // Add subnodes if present
      if (branch.subnodes) {
        const subRadius = 1;
        const subAngleStep = (Math.PI / 2) / (branch.subnodes.length + 1);

        branch.subnodes.forEach((subnode, j) => {
          const subnodeId = `${branchId}_sub_${j}`;
          const subAngle = angle - Math.PI / 4 + (j + 1) * subAngleStep;
          const subX = x + Math.cos(subAngle) * subRadius;
          const subZ = z + Math.sin(subAngle) * subRadius;

          nodes.push({
            uuid: subnodeId,
            title: subnode.title,
            shape: "Ball",
            size: 6,
            color: subnode.color || branch.color || this.getDefaultColor(i),
            location: { x: subX, y: -0.5, z: subZ },
          });

          links.push({
            fromUuid: branchId,
            toUuid: subnodeId,
            shape: "Solid",
            size: 1,
          });
        });
      }
    });

    return {
      nodes,
      links,
      metadata: {
        name: centralTopic,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Get a default color based on index
   */
  private static getDefaultColor(index: number): string {
    const colors = [
      "#FF6B6B", // Red
      "#4ECDC4", // Teal
      "#45B7D1", // Blue
      "#96CEB4", // Green
      "#FFEAA7", // Yellow
      "#DDA0DD", // Plum
      "#98D8C8", // Mint
      "#F7DC6F", // Gold
      "#BB8FCE", // Purple
      "#85C1E9", // Light Blue
    ];
    return colors[index % colors.length];
  }
}

export default NodaAgent;
