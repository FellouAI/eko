import React from "react";
import { TextItem } from "./TextItem";
import type { TaskData } from "../types";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";
import type { WorkflowAgent } from "@eko-ai/eko/types";
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
  const agent = task.agents.find(
    (a) =>
      a.agentNode.id === agentNode.id || a.agentNode.name === agentNode.name
  );
  const status = agent?.status || agentNode.status;

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        borderLeft: `3px solid ${
          status === "done"
            ? "#52c41a"
            : status === "error"
            ? "#ff4d4f"
            : status === "running"
            ? "#1890ff"
            : "#d9d9d9"
        }`,
      }}
      title={
        <Space>
          <Text strong>{agentNode.name}</Text>
          {status === "running" && <Spin size="small" />}
          {status === "done" && (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              完成
            </Tag>
          )}
          {status === "error" && (
            <Tag color="error" icon={<CloseCircleOutlined />}>
              错误
            </Tag>
          )}
        </Space>
      }
    >
      {agentNode.task && (
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {agentNode.task}
        </Paragraph>
      )}

      {agent && (
        <>
          {/* 按照内容出现顺序渲染 */}
          {agent.contentItems.map((item, index) => {
            if (item.type === "thinking") {
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
                  src={`data:${item.mimeType};base64,${item.data}`}
                  alt="Agent file"
                  style={{ maxWidth: "100%", marginTop: 8, marginBottom: 8 }}
                />
              );
            }
            return null;
          })}
          {agent.result && (
            <Alert
              message="执行结果"
              description={agent.result}
              type="success"
              style={{ marginTop: 8 }}
            />
          )}
          {agent.error && (
            <Alert
              message="执行错误"
              description={String(agent.error)}
              type="error"
              style={{ marginTop: 8 }}
            />
          )}
        </>
      )}
    </Card>
  );
};
