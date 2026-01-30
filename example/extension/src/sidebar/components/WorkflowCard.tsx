import React from "react";
import type { TaskData } from "../types";
import { RobotOutlined } from "@ant-design/icons";
import { Card, Space, Typography, Spin, Button } from "antd";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { buildAgentTree, WorkflowAgent } from "@eko-ai/eko";

const { Text, Paragraph } = Typography;

interface WorkflowCardProps {
  task: TaskData;
  onUpdateTask?: (status?: "stop") => void;
}

const sendWorkflowConfirmCallback = (
  callbackId: string,
  value: "confirm" | "cancel"
) => {
  chrome.runtime.sendMessage({
    type: "callback",
    data: { callbackId, value: value },
  });
};

export const WorkflowCard: React.FC<WorkflowCardProps> = ({
  task,
  onUpdateTask,
}) => {
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
            <RobotOutlined style={{ color: "#e0e0e0" }} />
            <Text strong style={{ color: "#e0e0e0" }}>Multi-Agent Workflow</Text>
            {!task.workflowStreamDone && <Spin size="small" />}
          </Space>
        }
        style={{ backgroundColor: "#2d2d2d", borderColor: "#424242" }}
        headStyle={{ borderBottom: "1px solid #424242", color: "#e0e0e0" }}
        bodyStyle={{ color: "#e0e0e0" }}
      >
        {workflow.thought && (
          <Paragraph style={{ marginBottom: 16, color: "#b0b0b0" }}>
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
                <Text strong style={{ color: "#722ed1" }}>
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
        {task.workflowConfirm === "pending" && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <Button
              onClick={() => {
                task.workflowConfirm = "cancel";
                sendWorkflowConfirmCallback(task.taskId, "cancel");
                onUpdateTask?.("stop");
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={() => {
                task.workflowConfirm = "confirm";
                sendWorkflowConfirmCallback(task.taskId, "confirm");
                onUpdateTask?.();
              }}
            >
              Confirm
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
