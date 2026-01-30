import React, { useState } from "react";
import { TextItem } from "./TextItem";
import { HumanCard } from "./HumanCard";
import type { TaskData } from "../types";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";
import type { WorkflowAgent } from "@eko-ai/eko/types";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Card, Space, Typography, Tag, Alert, Image, Spin } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;

interface AgentExecutionCardProps {
  agentNode: WorkflowAgent;
  task: TaskData;
}

export const AgentExecutionCard: React.FC<AgentExecutionCardProps> = ({
  agentNode,
  task,
}) => {
  const agent = task.agents.find((a) => a.agentNode.id === agentNode.id);
  const status = agent?.status || agentNode.status;
  const [respondedCallbacks, setRespondedCallbacks] = useState<Set<string>>(
    new Set()
  );

  const handleHumanResponse = (callbackId: string, value: any) => {
    setRespondedCallbacks((prev) => new Set(prev).add(callbackId));
    // Update the item in agent.contentItems
    if (agent) {
      const itemIndex = agent.contentItems.findIndex(
        (item) =>
          (item.type === "human_confirm" ||
            item.type === "human_input" ||
            item.type === "human_select" ||
            item.type === "human_help") &&
          item.callbackId === callbackId
      );
      if (itemIndex >= 0) {
        (agent.contentItems[itemIndex] as any).value = value;
        (agent.contentItems[itemIndex] as any).responded = true;
      }
    }
  };

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        backgroundColor: "#2d2d2d",
        borderColor: "#424242",
        borderLeft: `3px solid ${
          status === "done"
            ? "#52c41a"
            : status === "error"
            ? "#ff4d4f"
            : status === "running"
            ? "#722ed1"
            : "#616161"
        }`,
      }}
      headStyle={{ borderBottom: "1px solid #424242", color: "#e0e0e0" }}
      bodyStyle={{ color: "#e0e0e0" }}
      title={
        <Space>
          <Text strong style={{ color: "#e0e0e0" }}>{agentNode.name}</Text>
          {status === "running" && <Spin size="small" style={{ color: "#722ed1" }} />}
          {status === "done" && (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              Completed
            </Tag>
          )}
          {status === "error" && (
            <Tag color="error" icon={<CloseCircleOutlined />}>
              Error
            </Tag>
          )}
        </Space>
      }
    >
      {agentNode.task && (
        <Paragraph style={{ marginBottom: 8, color: "#b0b0b0" }}>
          {agentNode.task}
        </Paragraph>
      )}

      {agent && (
        <>
          {/* Render content in order of appearance */}
          {agent.contentItems.map((item, index) => {
            if (item.type === "thinking" && item.text != "[REDACTED]") {
              return (
                <div key={`thinking-${item.streamId}-${index}`}>
                  <ThinkingItem
                    streamId={item.streamId}
                    text={item.text}
                    streamDone={item.streamDone}
                  />
                </div>
              );
            } else if (item.type === "text") {
              return (
                <div key={`text-${item.streamId}-${index}`}>
                  <TextItem
                    streamId={item.streamId}
                    text={item.text}
                    streamDone={item.streamDone}
                  />
                </div>
              );
            } else if (item.type === "tool") {
              return (
                <div
                  key={`tool-${item.toolCallId}-${index}`}
                  style={{ marginBottom: 8 }}
                >
                  <ToolCallItem item={item} />
                </div>
              );
            } else if (item.type === "file") {
              return (
                <Image
                  key={`file-${index}`}
                  src={
                    item.data.startsWith("http")
                      ? item.data
                      : `data:${item.mimeType};base64,${item.data}`
                  }
                  alt="Agent file"
                  style={{ maxWidth: "100%", marginTop: 8, marginBottom: 8 }}
                />
              );
            } else if (item.type === "human_confirm") {
              const isResponded =
                respondedCallbacks.has(item.callbackId) || item.responded;
              return (
                <div key={`human-confirm-${item.callbackId}-${index}`}>
                  <HumanCard
                    item={{ ...item, responded: isResponded }}
                    onRespond={(value: any) =>
                      handleHumanResponse(item.callbackId, value)
                    }
                  />
                </div>
              );
            } else if (item.type === "human_input") {
              const isResponded =
                respondedCallbacks.has(item.callbackId) || item.responded;
              return (
                <div key={`human-input-${item.callbackId}-${index}`}>
                  <HumanCard
                    item={{ ...item, responded: isResponded }}
                    onRespond={(value: any) =>
                      handleHumanResponse(item.callbackId, value)
                    }
                  />
                </div>
              );
            } else if (item.type === "human_select") {
              const isResponded =
                respondedCallbacks.has(item.callbackId) || item.responded;
              return (
                <div key={`human-select-${item.callbackId}-${index}`}>
                  <HumanCard
                    item={{ ...item, responded: isResponded }}
                    onRespond={(value: any) =>
                      handleHumanResponse(item.callbackId, value)
                    }
                  />
                </div>
              );
            } else if (item.type === "human_help") {
              const isResponded =
                respondedCallbacks.has(item.callbackId) || item.responded;
              return (
                <div key={`human-help-${item.callbackId}-${index}`}>
                  <HumanCard
                    item={{ ...item, responded: isResponded }}
                    onRespond={(value: any) =>
                      handleHumanResponse(item.callbackId, value)
                    }
                  />
                </div>
              );
            }
            return null;
          })}
          {/* {agent.result && (
            <Alert
              message="Execution Result"
              description={<MarkdownRenderer content={agent.result} />}
              type="success"
              style={{ marginTop: 8 }}
            />
          )} */}
          {agent.error && (
            <Alert
              message="Execution Error"
              description={
                agent.error.name
                  ? agent.error.name + ": " + agent.error.message
                  : String(agent.error)
              }
              type="error"
              style={{ marginTop: 8 }}
            />
          )}
        </>
      )}
    </Card>
  );
};
