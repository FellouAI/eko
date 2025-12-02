import {
  WorkflowAgent,
  AgentNode,
  NormalAgentNode,
  ParallelAgentNode,
} from "../types/agent.types";

export function buildAgentTree(agents: WorkflowAgent[]): AgentNode {
  // Detect and handle circular dependencies
  const safeAgents = detectAndBreakCycles(agents);

  if (safeAgents.length === 0) {
    throw new Error("No executable agent");
  }

  // Establish dependency relationship mapping
  const agentMap = new Map<string, WorkflowAgent>();
  const dependents = new Map<string, WorkflowAgent[]>();

  for (const agent of safeAgents) {
    agentMap.set(agent.id, agent);
    dependents.set(agent.id, []);
  }

  for (const agent of safeAgents) {
    for (const depId of agent.dependsOn) {
      if (dependents.has(depId)) {
        dependents.get(depId)!.push(agent);
      }
    }
  }

  let entryAgents = safeAgents.filter((agent) => agent.dependsOn.length === 0);
  if (entryAgents.length === 0) {
    entryAgents = safeAgents.filter(
      (agent) =>
        agent.dependsOn.length == 1 && agent.dependsOn[0].endsWith("00")
    );
  }

  const processedAgents = new Set<string>();

  function buildNodeRecursive(
    currentAgents: WorkflowAgent[]
  ): AgentNode | undefined {
    if (currentAgents.length === 0) {
      return undefined;
    }
    for (const agent of currentAgents) {
      processedAgents.add(agent.id);
    }
    const nextLevelAgents: WorkflowAgent[] = [];
    const nextLevelSet = new Set<string>();

    for (const agent of currentAgents) {
      const dependentAgents = dependents.get(agent.id) || [];
      for (const dependentAgent of dependentAgents) {
        const allDependenciesProcessed = dependentAgent.dependsOn.every(
          (depId) => processedAgents.has(depId)
        );
        if (allDependenciesProcessed && !nextLevelSet.has(dependentAgent.id)) {
          nextLevelAgents.push(dependentAgent);
          nextLevelSet.add(dependentAgent.id);
        }
      }
    }

    const nextNode = buildNodeRecursive(nextLevelAgents);

    if (currentAgents.length === 1) {
      return {
        type: "normal",
        agent: currentAgents[0],
        nextAgent: nextNode,
      } as NormalAgentNode;
    } else {
      const parallelNodes: NormalAgentNode[] = currentAgents.map(
        (agent) =>
          ({
            type: "normal",
            agent: agent,
            nextAgent: undefined,
          } as NormalAgentNode)
      );
      return {
        type: "parallel",
        agents: parallelNodes,
        nextAgent: nextNode,
      } as ParallelAgentNode;
    }
  }

  const rootNode = buildNodeRecursive(entryAgents);
  if (!rootNode) {
    throw new Error("Unable to build execution tree");
  }

  return rootNode;
}

function detectAndBreakCycles(agents: WorkflowAgent[]): WorkflowAgent[] {
  // Detect cyclic dependencies and return a safe dependency relationship
  // Use topological sorting algorithm to detect cycles, if a cycle is found, break some dependencies.
  const agentMap = new Map<string, WorkflowAgent>();
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const agent of agents) {
    agentMap.set(agent.id, agent);
    inDegree.set(agent.id, 0);
    adjList.set(agent.id, []);
  }
  for (const agent of agents) {
    for (const depId of agent.dependsOn) {
      if (agentMap.has(depId)) {
        // depId -> agent.id indicates that the agent depends on depId.
        adjList.get(depId)!.push(agent.id);
        inDegree.set(agent.id, inDegree.get(agent.id)! + 1);
      }
    }
  }
  // Topological Sorting Detects Cycles
  const queue: string[] = [];
  const processedCount = new Map<string, number>();
  for (const [agentId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(agentId);
    }
    processedCount.set(agentId, 0);
  }

  let processedNodes = 0;
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    processedNodes++;
    for (const neighborId of adjList.get(currentId)!) {
      const newInDegree = inDegree.get(neighborId)! - 1;
      inDegree.set(neighborId, newInDegree);
      if (newInDegree === 0) {
        queue.push(neighborId);
      }
    }
  }

  if (processedNodes < agents.length) {
    console.warn(
      "Detected a circular dependency, automatically disconnecting the circular link..."
    );
    const cyclicNodes = new Set<string>();
    for (const [agentId, degree] of inDegree.entries()) {
      if (degree > 0) {
        cyclicNodes.add(agentId);
      }
    }

    const fixedAgents: WorkflowAgent[] = [];

    for (const agent of agents) {
      if (cyclicNodes.has(agent.id)) {
        const filteredDependsOn = agent.dependsOn.filter(
          (depId) => !cyclicNodes.has(depId) || !agentMap.has(depId)
        );

        // Preserve the shortest path dependency
        if (filteredDependsOn.length === 0 && agent.dependsOn.length > 0) {
          const firstValidDep = agent.dependsOn.find((depId) =>
            agentMap.has(depId)
          );
          if (firstValidDep && !cyclicNodes.has(firstValidDep)) {
            filteredDependsOn.push(firstValidDep);
          }
        }

        agent.dependsOn = filteredDependsOn;
        fixedAgents.push(agent);

        if (filteredDependsOn.length !== agent.dependsOn.length) {
          console.warn(
            `The partial cyclic dependency of agent ${agent.id} has been disconnected.`
          );
        }
      } else {
        // Non-cyclic node, filter out non-existent dependencies
        const validDependsOn = agent.dependsOn.filter((depId) =>
          agentMap.has(depId)
        );
        agent.dependsOn = validDependsOn;
        fixedAgents.push(agent);
      }
    }

    return fixedAgents;
  }

  // No loops, just need to filter out non-existent dependencies
  return agents.map((agent) => {
    agent.dependsOn = agent.dependsOn.filter((depId) => agentMap.has(depId));
    return agent;
  });
}
