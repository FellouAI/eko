import { createRoot } from "react-dom/client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Button,
  Input,
  Card,
  Typography,
  Space,
  Spin,
  Alert,
  Collapse,
  Tag,
  Image,
  Empty,
} from "antd";
import {
  SendOutlined,
  PaperClipOutlined,
  RobotOutlined,
  UserOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type {
  ChatStreamMessage,
  AgentStreamMessage,
  Workflow,
  WorkflowAgent,
  ToolResult,
} from "@eko-ai/eko/types";
import { uuidv4 } from "@eko-ai/eko";

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

const MarkdownRenderer = ({ content }: { content: string }) => {
  if (!content) {
    return null;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

// 消息类型定义
type MessageRole = "user" | "assistant";

interface StreamText {
  streamId: string;
  text: string;
  streamDone: boolean;
}

interface ToolCall {
  toolCallId: string;
  toolName: string;
  params?: Record<string, any>;
  paramsText?: string;
  result?: ToolResult;
  running?: boolean;
  runningText?: string;
}

interface TaskData {
  taskId: string;
  workflow?: Workflow;
  workflowStreamDone?: boolean;
  agents: Map<string, AgentExecution>;
}

type ContentItem = 
  | { type: "thinking"; id: string }
  | { type: "text"; id: string }
  | { type: "tool"; id: string }
  | { type: "file"; id: number };

interface AgentExecution {
  agentNode: WorkflowAgent;
  texts: Map<string, StreamText>;
  thinking: Map<string, StreamText>;
  toolCalls: Map<string, ToolCall>;
  files: Array<{ mimeType: string; data: string }>;
  contentOrder: ContentItem[]; // 内容出现顺序
  status: "init" | "running" | "done" | "error";
  result?: string;
  error?: any;
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  // AI 消息相关
  texts?: Map<string, StreamText>;
  thinking?: Map<string, StreamText>;
  toolCalls?: Map<string, ToolCall>;
  files?: Array<{ mimeType: string; data: string }>;
  error?: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  // Task 相关（deepAction 工具调用）
  task?: TaskData;
}

const AppRun = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 处理 chat 回调
  const handleChatCallback = useCallback((data: ChatStreamMessage) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const aiMessageId = `ai-${data.messageId}`;
      let message = newMessages.find((m) => m.id === aiMessageId);

      // 如果 AI 消息不存在，创建它
      if (!message) {
        // 确保对应的用户消息存在
        const userMessage = newMessages.find((m) => m.id === data.messageId);
        if (!userMessage) {
          // 用户消息不存在，可能是消息顺序问题，先返回
          return prev;
        }
        // 创建 AI 消息
        const aiMessage: ChatMessage = {
          id: aiMessageId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          texts: new Map(),
          thinking: new Map(),
          toolCalls: new Map(),
          files: [],
        };
        newMessages.push(aiMessage);
        message = aiMessage;
      }

      // 处理不同类型的回调
      if (data.type === "text" || data.type === "thinking") {
        const map = data.type === "text" ? message.texts! : message.thinking!;
        map.set(data.streamId, {
          streamId: data.streamId,
          text: data.text,
          streamDone: data.streamDone,
        });
        // 更新 content 为最新的文本
        if (data.type === "text" && data.streamDone) {
          message.content = data.text;
        }
      } else if (data.type === "file") {
        if (!message.files) message.files = [];
        message.files.push({ mimeType: data.mimeType, data: data.data });
      } else if (data.type === "tool_streaming") {
        if (!message.toolCalls) message.toolCalls = new Map();
        let toolCall = message.toolCalls.get(data.toolCallId);
        if (!toolCall) {
          toolCall = {
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            paramsText: data.paramsText,
          };
          message.toolCalls.set(data.toolCallId, toolCall);
        } else {
          toolCall.paramsText = data.paramsText;
        }
      } else if (data.type === "tool_use") {
        if (!message.toolCalls) message.toolCalls = new Map();
        let toolCall = message.toolCalls.get(data.toolCallId);
        if (!toolCall) {
          toolCall = {
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            params: data.params,
          };
          message.toolCalls.set(data.toolCallId, toolCall);
        } else {
          toolCall.params = data.params;
        }
      } else if (data.type === "tool_running") {
        if (!message.toolCalls) message.toolCalls = new Map();
        let toolCall = message.toolCalls.get(data.toolCallId);
        if (!toolCall) {
          toolCall = {
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            running: true,
            runningText: data.text,
          };
          message.toolCalls.set(data.toolCallId, toolCall);
        } else {
          toolCall.running = !data.streamDone;
          toolCall.runningText = data.text;
        }
      } else if (data.type === "tool_result") {
        if (!message.toolCalls) message.toolCalls = new Map();
        let toolCall = message.toolCalls.get(data.toolCallId);
        if (!toolCall) {
          toolCall = {
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            params: data.params,
            result: data.toolResult,
          };
          message.toolCalls.set(data.toolCallId, toolCall);
        } else {
          toolCall.result = data.toolResult;
          toolCall.running = false;
        }

        // 如果是 deepAction 工具，初始化 task 数据
        if (data.toolName === "deepAction" && !message.task) {
          message.task = {
            taskId: (data.params as any)?.taskId || uuidv4(),
            agents: new Map(),
          };
        }
      } else if (data.type === "error") {
        message.error = data.error;
      } else if (data.type === "finish") {
        message.usage = data.usage;
      }

      return newMessages;
    });
  }, []);

  // 处理 task 回调
  const handleTaskCallback = useCallback((data: AgentStreamMessage & { messageId: string }) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const message = newMessages.find((m) => m.id === `ai-${data.messageId}`);

      if (!message) return prev;

      // 如果 task 不存在，创建它
      if (!message.task) {
        message.task = {
          taskId: data.taskId,
          agents: new Map(),
        };
      }

      if (data.type === "workflow") {
        message.task.workflow = data.workflow;
        message.task.workflowStreamDone = data.streamDone;
      } else if (data.type === "agent_start") {
        const agentExecution: AgentExecution = {
          agentNode: data.agentNode,
          texts: new Map(),
          thinking: new Map(),
          toolCalls: new Map(),
          files: [],
          contentOrder: [],
          status: "running",
        };
        message.task.agents.set(data.nodeId || data.agentName, agentExecution);
      } else if (data.type === "text" || data.type === "thinking") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          const map = data.type === "text" ? agent.texts : agent.thinking;
          const isNew = !map.has(data.streamId);
          map.set(data.streamId, {
            streamId: data.streamId,
            text: data.text,
            streamDone: data.streamDone,
          });
          // 如果是新的 streamId，添加到内容顺序列表
          if (isNew) {
            agent.contentOrder.push({
              type: data.type,
              id: data.streamId,
            });
          }
        }
      } else if (data.type === "file") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          const fileIndex = agent.files.length;
          agent.files.push({ mimeType: data.mimeType, data: data.data });
          agent.contentOrder.push({
            type: "file",
            id: fileIndex,
          });
        }
      } else if (data.type === "tool_streaming") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          let toolCall = agent.toolCalls.get(data.toolCallId);
          if (!toolCall) {
            toolCall = {
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              paramsText: data.paramsText,
            };
            agent.toolCalls.set(data.toolCallId, toolCall);
            // 新的工具调用，添加到内容顺序列表
            agent.contentOrder.push({
              type: "tool",
              id: data.toolCallId,
            });
          } else {
            toolCall.paramsText = data.paramsText;
          }
        }
      } else if (data.type === "tool_use") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          let toolCall = agent.toolCalls.get(data.toolCallId);
          if (!toolCall) {
            toolCall = {
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
            };
            agent.toolCalls.set(data.toolCallId, toolCall);
            // 新的工具调用，添加到内容顺序列表
            agent.contentOrder.push({
              type: "tool",
              id: data.toolCallId,
            });
          } else {
            toolCall.params = data.params;
          }
        }
      } else if (data.type === "tool_running") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          let toolCall = agent.toolCalls.get(data.toolCallId);
          if (!toolCall) {
            toolCall = {
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              running: true,
              runningText: data.text,
            };
            agent.toolCalls.set(data.toolCallId, toolCall);
            // 新的工具调用，添加到内容顺序列表
            agent.contentOrder.push({
              type: "tool",
              id: data.toolCallId,
            });
          } else {
            toolCall.running = !data.streamDone;
            toolCall.runningText = data.text;
          }
        }
      } else if (data.type === "tool_result") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          let toolCall = agent.toolCalls.get(data.toolCallId);
          if (!toolCall) {
            toolCall = {
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
              result: data.toolResult,
            };
            agent.toolCalls.set(data.toolCallId, toolCall);
            // 新的工具调用，添加到内容顺序列表
            agent.contentOrder.push({
              type: "tool",
              id: data.toolCallId,
            });
          } else {
            toolCall.result = data.toolResult;
            toolCall.running = false;
          }
        }
      } else if (data.type === "agent_result") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          agent.status = data.error ? "error" : "done";
          agent.result = data.result;
          agent.error = data.error;
        }
      } else if (data.type === "error") {
        const agent = message.task.agents.get(data.nodeId || data.agentName);
        if (agent) {
          agent.status = "error";
          agent.error = data.error;
        }
      }

      return newMessages;
    });
  }, []);

  // 监听 background 消息
  useEffect(() => {
    const handleMessage = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (message.type === "chat_callback") {
        handleChatCallback(message.data);
      } else if (message.type === "task_callback") {
        handleTaskCallback(message.data);
      }
      sendResponse({ success: true });
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleChatCallback, handleTaskCallback]);

  // 发送消息
  const sendMessage = async () => {
    if (!inputValue.trim() || sending) return;

    const messageId = uuidv4();
    const userMessage: ChatMessage = {
      id: messageId,
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setSending(true);

    try {
      const requestId = uuidv4();
      chrome.runtime.sendMessage(
        {
          requestId,
          type: "chat",
          data: {
            messageId,
            user: [{ type: "text", text: inputValue }],
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message:", chrome.runtime.lastError);
          }
        }
      );
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  // 停止消息
  const stopMessage = (messageId: string) => {
    chrome.runtime.sendMessage({
      type: "stop",
      data: { messageId },
    });
  };

  // 渲染流式文本
  const renderStreamText = (texts: Map<string, StreamText>) => {
    const textArray = Array.from(texts.entries());
    if (textArray.length === 0) return null;
    
    // 显示所有文本流，每个 streamId 一个段落
    return (
      <div>
        {textArray.map(([streamId, streamText], index) => (
          <div
            key={streamId}
            style={{ margin: index === 0 ? 0 : "8px 0 0 0" }}
          >
            <MarkdownRenderer content={streamText.text} />
            {!streamText.streamDone && (
              <span className="streaming-cursor">▊</span>
            )}
          </div>
        ))}
      </div>
    );
  };

  // 渲染思考内容
  const renderThinking = (thinking: Map<string, StreamText>) => {
    const thinkingArray = Array.from(thinking.values());
    if (thinkingArray.length === 0) return null;
    const latestThinking = thinkingArray[thinkingArray.length - 1];
    return (
      <Collapse
        size="small"
        style={{ marginBottom: 8 }}
        items={[
          {
            key: "thinking",
            label: (
              <Space>
                <LoadingOutlined />
                <Text type="secondary">思考中...</Text>
              </Space>
            ),
            children: (
              <Paragraph
                style={{ margin: 0, whiteSpace: "pre-wrap" }}
                type="secondary"
              >
                {latestThinking.text}
                {!latestThinking.streamDone && (
                  <span className="streaming-cursor">▊</span>
                )}
              </Paragraph>
            ),
          },
        ]}
      />
    );
  };

  // 渲染工具调用
  const renderToolCall = (toolCall: ToolCall) => {
    return (
      <Card
        size="small"
        style={{ marginTop: 8, backgroundColor: "#f5f5f5" }}
        title={
          <Space>
            <ToolOutlined />
            <Text strong>{toolCall.toolName}</Text>
            {toolCall.running && <Spin size="small" />}
            {toolCall.result && (
              <Tag
                color={toolCall.result.isError ? "red" : "green"}
                icon={
                  toolCall.result.isError ? (
                    <CloseCircleOutlined />
                  ) : (
                    <CheckCircleOutlined />
                  )
                }
              >
                {toolCall.result.isError ? "失败" : "完成"}
              </Tag>
            )}
          </Space>
        }
      >
        {toolCall.paramsText && !toolCall.params && (
          <Text type="secondary" code>
            {toolCall.paramsText}
            <span className="streaming-cursor">▊</span>
          </Text>
        )}
        {toolCall.params && (
          <Collapse
            size="small"
            items={[
              {
                key: "params",
                label: "参数",
                children: (
                  <pre style={{ margin: 0, fontSize: 12 }}>
                    {JSON.stringify(toolCall.params, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        )}
        {toolCall.running && toolCall.runningText && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {toolCall.runningText}
            {!toolCall.running && <span className="streaming-cursor">▊</span>}
          </Paragraph>
        )}
        {toolCall.result && (
          <div style={{ marginTop: 8 }}>
            {toolCall.result.content.map((part, index) => {
              if (part.type === "text") {
                return (
                  <Paragraph key={index} style={{ margin: 0 }}>
                    {part.text}
                  </Paragraph>
                );
              } else if (part.type === "image") {
                return (
                  <Image
                    key={index}
                    src={`data:${part.mimeType || "image/png"};base64,${part.data}`}
                    alt="Tool result"
                    style={{ maxWidth: "100%", marginTop: 8 }}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </Card>
    );
  };

  // 渲染 workflow
  const renderWorkflow = (task: TaskData) => {
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
                <div>{renderAgentExecution(group[0], task)}</div>
              ) : (
                // 并行 agent
                <div>
                  <Text strong style={{ color: "#1890ff" }}>
                    [{group.map((a) => a.name).join(", ")}]
                  </Text>
                  <div style={{ marginLeft: 16, marginTop: 8 }}>
                    {group.map((agent) => (
                      <div key={agent.id} style={{ marginBottom: 8 }}>
                        {renderAgentExecution(agent, task)}
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

  // 渲染 agent 执行
  const renderAgentExecution = (agentNode: WorkflowAgent, task: TaskData) => {
    const agent = task.agents.get(agentNode.id);
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
            {agent.contentOrder.map((item, index) => {
              if (item.type === "thinking") {
                const thinking = agent.thinking?.get(item.id);
                if (!thinking) return null;
                return (
                  <div key={`thinking-${item.id}`} style={{ marginBottom: 8 }}>
                    {renderThinking(new Map([[item.id, thinking]]))}
                  </div>
                );
              } else if (item.type === "text") {
                const text = agent.texts?.get(item.id);
                if (!text) return null;
                return (
                  <div key={`text-${item.id}`} style={{ marginBottom: 8 }}>
                    {renderStreamText(new Map([[item.id, text]]))}
                  </div>
                );
              } else if (item.type === "tool") {
                const toolCall = agent.toolCalls?.get(item.id);
                if (!toolCall) return null;
                return (
                  <div key={`tool-${item.id}`} style={{ marginBottom: 8 }}>
                    {renderToolCall(toolCall)}
                  </div>
                );
              } else if (item.type === "file") {
                const file = agent.files?.[item.id];
                if (!file) return null;
                return (
                  <Image
                    key={`file-${item.id}`}
                    src={`data:${file.mimeType};base64,${file.data}`}
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

  // 渲染消息
  const renderMessage = (message: ChatMessage) => {
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
            <Space>
              <UserOutlined />
              <Paragraph style={{ margin: 0, color: "white" }}>
                {message.content}
              </Paragraph>
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
          {message.thinking && message.thinking.size > 0 && (
            <div style={{ marginBottom: 8 }}>{renderThinking(message.thinking)}</div>
          )}
          {message.texts && message.texts.size > 0 && (
            <div style={{ marginBottom: 8 }}>{renderStreamText(message.texts)}</div>
          )}
          {!message.texts && message.content && (
            <div style={{ marginBottom: 8 }}>
              <MarkdownRenderer content={message.content} />
            </div>
          )}
          {message.files && message.files.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {message.files.map((file, index) => (
                <Image
                  key={index}
                  src={`data:${file.mimeType};base64,${file.data}`}
                  alt="Message file"
                  style={{ maxWidth: "100%", marginTop: 8 }}
                />
              ))}
            </div>
          )}
          {message.toolCalls && message.toolCalls.size > 0 && (
            <div style={{ marginTop: 8 }}>
              {Array.from(message.toolCalls.values()).map((toolCall) => (
                <div key={toolCall.toolCallId} style={{ marginBottom: 8 }}>
                  {renderToolCall(toolCall)}
                </div>
              ))}
            </div>
          )}
          {message.task && renderWorkflow(message.task)}
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#ffffff",
      }}
    >
      {/* 消息区域 */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          backgroundColor: "#f5f5f5",
        }}
      >
        {messages.length === 0 ? (
          <Empty
            description="开始对话吧！"
            style={{ marginTop: "20vh" }}
          />
        ) : (
          messages.map((message) => (
            <div key={message.id}>{renderMessage(message)}</div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div
        style={{
          padding: "16px",
          backgroundColor: "#ffffff",
          borderTop: "1px solid #e8e8e8",
        }}
      >
        <Space.Compact style={{ width: "100%" }}>
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="输入消息... (Shift+Enter 换行)"
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ flex: 1 }}
            disabled={sending}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendMessage}
            loading={sending}
            disabled={!inputValue.trim()}
          >
            发送
          </Button>
        </Space.Compact>
      </div>

      <style>{`
        .streaming-cursor {
          animation: blink 1s infinite;
          color: #1890ff;
        }
        .markdown-body {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.88);
        }
        .markdown-body p {
          margin: 0 0 8px 0;
          white-space: pre-wrap;
        }
        .markdown-body ul,
        .markdown-body ol {
          margin: 0 0 8px 16px;
        }
        .markdown-body code {
          background: rgba(0,0,0,0.04);
          padding: 2px 4px;
          border-radius: 4px;
          font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        }
        .markdown-body pre code {
          display: block;
          padding: 12px;
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <AppRun />
  </React.StrictMode>
);
