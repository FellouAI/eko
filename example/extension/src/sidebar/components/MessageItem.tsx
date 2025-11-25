import React from "react";
import { TextItem } from "./TextItem";
import type { ChatMessage } from "../types";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";
import { WorkflowCard } from "./WorkflowCard";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Card, Space, Typography, Alert, Image, Spin } from "antd";
import { RobotOutlined, UserOutlined, FileOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;

interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  if (message.role === "user") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        <Card
          style={{
            maxWidth: "70%",
            backgroundColor: "#1890ff",
            color: "white",
          }}
          styles={{
            body: { padding: "12px 16px" },
          }}
        >
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {(message.content || message.files?.length) && (
              <Space>
                <UserOutlined />
                {message.content && (
                  <Paragraph style={{ margin: 0, color: "white" }}>
                    {message.content}
                  </Paragraph>
                )}
                {message.loading && (
                  <Spin size="small" style={{ color: "white" }} />
                )}
              </Space>
            )}
            {message.files && message.files.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {message.files.map((file) => {
                  const isImage = file.mimeType.startsWith("image/");
                  return (
                    <div
                      key={file.id}
                      style={{
                        marginBottom: 8,
                        padding: 8,
                        backgroundColor: "rgba(255, 255, 255, 0.2)",
                        borderRadius: 4,
                      }}
                    >
                      {isImage ? (
                        <Image
                          src={`data:${file.mimeType};base64,${file.base64Data}`}
                          alt={file.filename}
                          style={{
                            maxWidth: "100%",
                            maxHeight: 200,
                            borderRadius: 4,
                          }}
                          preview={false}
                        />
                      ) : (
                        <Space>
                          <FileOutlined style={{ color: "white" }} />
                          <Text style={{ color: "white", fontSize: 12 }}>
                            {file.filename}
                          </Text>
                        </Space>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Space>
        </Card>
      </div>
    );
  }

  // AI 消息
  return (
    <div style={{ marginBottom: 16 }}>
      <Card
        style={{ backgroundColor: "#fafafa" }}
        title={
          <Space>
            <RobotOutlined />
            <Text strong>AI 助手</Text>
          </Space>
        }
      >
        {message.contentItems && message.contentItems.length > 0
          ? message.contentItems.map((item, index) => {
              if (item.type === "thinking") {
                return (
                  <div key={`chat-thinking-${item.streamId}-${index}`}>
                    <ThinkingItem
                      streamId={item.streamId}
                      text={item.text}
                      streamDone={item.streamDone}
                    />
                  </div>
                );
              } else if (item.type === "text") {
                return (
                  <div key={`chat-text-${item.streamId}-${index}`}>
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
                    key={`chat-tool-${item.toolCallId}-${index}`}
                    style={{ marginBottom: 8 }}
                  >
                    <ToolCallItem item={item} />
                  </div>
                );
              } else if (item.type === "file") {
                return (
                  <Image
                    key={`chat-file-${index}`}
                    src={`data:${item.mimeType};base64,${item.data}`}
                    alt="Message file"
                    style={{ maxWidth: "100%", marginTop: 8, marginBottom: 8 }}
                  />
                );
              } else if (item.type === "task") {
                return (
                  <div
                    key={`chat-task-${item.taskId}-${index}`}
                    style={{ marginBottom: 8 }}
                  >
                    <WorkflowCard task={item.task} />
                  </div>
                );
              }
              return null;
            })
          : message.content && (
              <div style={{ marginBottom: 8 }}>
                <MarkdownRenderer content={message.content} />
              </div>
            )}
        {message.error && (
          <Alert
            message="错误"
            description={String(message.error)}
            type="error"
            style={{ marginTop: 8 }}
          />
        )}
      </Card>
    </div>
  );
};
