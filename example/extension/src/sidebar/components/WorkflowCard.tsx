import React from "react";
import type { TaskData } from "../types";
import { RobotOutlined } from "@ant-design/icons";
import { Card, Space, Typography, Spin } from "antd";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { buildAgentTree, WorkflowAgent } from "@eko-ai/eko";

const { Text, Paragraph } = Typography;

interface WorkflowCardProps {
  task: TaskData;
}

export const WorkflowCard: React.FC<WorkflowCardProps> = ({ task }) => {
  if (!task.workflow) return null;

  const workflow = task.workflow;
  const agents = workflow.agents;

  // Build agent tree structure
  const buildAgentGroups = () => {
    if (agents.length === 0) {
      return [];
    }
    const groups: WorkflowAgent[][] = [];
    let agentTree = buildAgentTree(agents);
    while (true) {
      if (agentTree.type === "normal") {
        groups.push([agentTree.agent]);
      } else {
        groups.push(agentTree.agents.map((a) => a.agent));
      }
      if (!agentTree.nextAgent) {
        break;
      }
      agentTree = agentTree.nextAgent;
    }
    return groups;
  };

  const agentGroups = buildAgentGroups();

  return (
    <div style={{ marginTop: 16 }}>
      <Card
        size="small"
        title={
          <Space>
            <RobotOutlined />
            <Text strong>Multi-Agent Workflow</Text>
            {!task.workflowStreamDone && <Spin size="small" />}
          </Space>
        }
        style={{ backgroundColor: "#f0f7ff" }}
      >
        {workflow.thought && (
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {workflow.thought}
          </Paragraph>
        )}
        {agentGroups.map((group, groupIndex) => (
          <div key={groupIndex} style={{ marginBottom: 16 }}>
            {group.length === 1 ? (
              // Single agent
              <div>
                <AgentExecutionCard agentNode={group[0]} task={task} />
              </div>
            ) : (
              // Parallel agents
              <div>
                <Text strong style={{ color: "#1890ff" }}>
                  [{group.map((a) => a.name).join(", ")}]
                </Text>
                <div style={{ marginLeft: 16, marginTop: 8 }}>
                  {group.map((agent) => (
                    <div key={agent.id} style={{ marginBottom: 8 }}>
                      <AgentExecutionCard agentNode={agent} task={task} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
};
