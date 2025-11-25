import React from "react";
import type { TaskData } from "../types";
import { WorkflowAgent } from "@eko-ai/eko";
import { RobotOutlined } from "@ant-design/icons";
import { Card, Space, Typography, Spin } from "antd";
import { AgentExecutionCard } from "./AgentExecutionCard";

const { Text, Paragraph } = Typography;

interface WorkflowCardProps {
  task: TaskData;
}

export const WorkflowCard: React.FC<WorkflowCardProps> = ({ task }) => {
  if (!task.workflow) return null;

  const workflow = task.workflow;
  const agents = workflow.agents;

  // 构建 agent 树结构
  const buildAgentGroups = () => {
    const groups: WorkflowAgent[][] = [];
    let currentGroup: WorkflowAgent[] = [];

    for (const agent of agents) {
      if (agent.parallel) {
        currentGroup.push(agent);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([agent]);
      }
    }
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
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
            <Text strong>Multi-Agent 工作流</Text>
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
              // 单个 agent
              <div>
                <AgentExecutionCard agentNode={group[0]} task={task} />
              </div>
            ) : (
              // 并行 agent
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
