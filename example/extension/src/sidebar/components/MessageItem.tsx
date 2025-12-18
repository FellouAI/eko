import React, { useMemo } from "react";
import { TextItem } from "./TextItem";
import type { ChatMessage } from "../types";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";
import { WorkflowCard } from "./WorkflowCard";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { AgentExecutionCard } from "./AgentExecutionCard";
import { Card, Space, Typography, Alert, Image, Spin } from "antd";
import { RobotOutlined, UserOutlined, FileOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;

const decodeHtmlEntities = (text: string) => {
  if (!text) return "";
  if (typeof window === "undefined") {
    return text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
};

const renderContentWithWebRefs = (
  content: string,
  onWebRefClick: (url: string) => void
) => {
  if (!content) return null;
  const elements: React.ReactNode[] = [];
  const regex =
    /<span class="webpage-reference"[^>]*tab-id="([^"]+)"[^>]*url="([^"]+)"[^>]*>(.*?)<\/span>/gi;
  let lastIndex = 0;
  let keyIndex = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const normalized = text.replace(/<br\s*\/?>/gi, "\n");
    const decoded = decodeHtmlEntities(normalized);
    if (!decoded) return;
    const parts = decoded.split(/(\n)/);
    parts.forEach((part) => {
      if (!part) {
        return;
      }
      if (part === "\n") {
        elements.push(<br key={`br-${keyIndex++}`} />);
      } else {
        elements.push(
          <React.Fragment key={`text-${keyIndex++}`}>{part}</React.Fragment>
        );
      }
    });
  };

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [fullMatch, tabId, url, title] = match;
    if (match.index > lastIndex) {
      pushText(content.slice(lastIndex, match.index));
    }

    const decodedTitle = decodeHtmlEntities(title);
    const decodedUrl = decodeHtmlEntities(url);
    elements.push(
      <span
        key={`webref-${tabId || keyIndex}`}
        className="webpage-reference-display user-webpage-reference"
        onClick={() => onWebRefClick(decodedUrl)}
      >
        {`${decodedTitle}`}
      </span>
    );
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < content.length) {
    pushText(content.slice(lastIndex));
  }

  if (elements.length === 0) {
    return decodeHtmlEntities(content);
  }

  return elements;
};

interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const handleWebRefClick = (url: string) => {
    if (!url) return;
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  const userContent = useMemo(
    () => renderContentWithWebRefs(message.content || "", handleWebRefClick),
    [message.content]
  );

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
            {(message.content || message.uploadedFiles?.length) && (
              <Space>
                <UserOutlined />
                {message.content && (
                  <Paragraph style={{ margin: 0, color: "white" }}>
                    {userContent}
                  </Paragraph>
                )}
                {message.status == "waiting" && (
                  <Spin size="small" style={{ color: "white" }} />
                )}
              </Space>
            )}
            {message.uploadedFiles && message.uploadedFiles.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {message.uploadedFiles.map((file) => {
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
                          src={
                            file.url
                              ? file.url
                              : `data:${file.mimeType};base64,${file.base64Data}`
                          }
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

  // AI message
  return (
    <div style={{ marginBottom: 16 }}>
      <Card
        style={{ backgroundColor: "#fafafa" }}
        title={
          <Space>
            <RobotOutlined />
            <Text strong>AI Assistant</Text>
          </Space>
        }
      >
        {message.contentItems && message.contentItems.length > 0 ? (
          message.contentItems.map((item, index) => {
            if (item.type === "thinking" && item.text != "[REDACTED]") {
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
                  src={
                    item.data.startsWith("http")
                      ? item.data
                      : `data:${item.mimeType};base64,${item.data}`
                  }
                  alt="Message file"
                  style={{ maxWidth: "100%", marginTop: 8, marginBottom: 8 }}
                />
              );
            } else if (
              item.type === "task" &&
              (item.task.workflow || item.task.agents?.length > 0)
            ) {
              return (
                <div
                  key={`chat-task-${item.taskId}-${index}`}
                  style={{ marginBottom: 8 }}
                >
                  {item.task.workflow ? (
                    // Multi-agent workflow
                    <WorkflowCard task={item.task} />
                  ) : (
                    // Single agent tool
                    <AgentExecutionCard
                      agentNode={item.task.agents[0].agentNode}
                      task={item.task}
                    />
                  )}
                </div>
              );
            }
            return null;
          })
        ) : message.content ? (
          <div style={{ marginBottom: 8 }}>
            <MarkdownRenderer content={message.content} />
          </div>
        ) : message.status == "waiting" ? (
          <Spin size="small" />
        ) : (
          <></>
        )}
        {message.error && (
          <Alert
            message="Error"
            description={String(message.error)}
            type="error"
            style={{ marginTop: 8 }}
          />
        )}
      </Card>
    </div>
  );
};
