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
  StopOutlined,
  FileOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type {
  Workflow,
  ToolResult,
  WorkflowAgent,
  ChatStreamMessage,
  AgentStreamMessage,
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

type ChatContentItem =
  | { type: "thinking"; streamId: string; text: string; streamDone: boolean }
  | { type: "text"; streamId: string; text: string; streamDone: boolean }
  | { type: "file"; mimeType: string; data: string }
  | { 
      type: "tool"; 
      toolCallId: string; 
      toolName: string; 
      params?: Record<string, any>; 
      paramsText?: string; 
      result?: ToolResult; 
      running?: boolean; 
      runningText?: string;
    }
  | { type: "task"; taskId: string; task: TaskData };

interface TaskData {
  taskId: string;
  workflow?: Workflow;
  workflowStreamDone?: boolean;
  agents: AgentExecution[]; // 按执行顺序排列
}

type AgentContentItem =
  | { type: "thinking"; streamId: string; text: string; streamDone: boolean }
  | { type: "text"; streamId: string; text: string; streamDone: boolean }
  | { type: "file"; mimeType: string; data: string }
  | { 
      type: "tool"; 
      toolCallId: string; 
      toolName: string; 
      params?: Record<string, any>; 
      paramsText?: string; 
      result?: ToolResult; 
      running?: boolean; 
      runningText?: string;
    };

interface AgentExecution {
  agentNode: WorkflowAgent;
  contentItems: AgentContentItem[]; // 所有内容按顺序
  status: "init" | "running" | "done" | "error";
  result?: string;
  error?: any;
}

interface UploadedFile {
  id: string;
  file: File;
  base64Data: string;
  mimeType: string;
  filename: string;
  fileId?: string; // 上传后的 fileId
  url?: string; // 上传后的 URL
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  contentItems: ChatContentItem[]; // 所有内容按顺序
  files?: UploadedFile[]; // 用户消息中的文件
  loading?: boolean; // 用户消息等待回调的 loading 状态
  error?: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const AppRun = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null); // 当前正在处理的消息 ID
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]); // 当前待发送的文件
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        // 取消用户消息的 loading 状态
        userMessage.loading = false;
        // 创建 AI 消息
        const aiMessage: ChatMessage = {
          id: aiMessageId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          contentItems: [],
        };
        newMessages.push(aiMessage);
        message = aiMessage;
      }

      if (!message.contentItems) {
        message.contentItems = [];
      }

      // 处理不同类型的回调
      if (data.type === "text" || data.type === "thinking") {
        // 查找是否已存在相同的 streamId
        const existingIndex = message.contentItems.findIndex(
          (item) => 
            (item.type === "text" || item.type === "thinking") && 
            item.streamId === data.streamId
        );
        
        if (existingIndex >= 0) {
          // 更新已存在的项
          (message.contentItems[existingIndex] as any).text = data.text;
          (message.contentItems[existingIndex] as any).streamDone = data.streamDone;
        } else {
          // 添加新项
          message.contentItems.push({
            type: data.type,
            streamId: data.streamId,
            text: data.text,
            streamDone: data.streamDone,
          });
        }
        
        // 更新 content 为最新的文本
        if (data.type === "text" && data.streamDone) {
          message.content = data.text;
        }
      } else if (data.type === "file") {
        message.contentItems.push({
          type: "file",
          mimeType: data.mimeType,
          data: data.data,
        });
      } else if (data.type === "tool_streaming") {
        // 查找是否已存在相同的 toolCallId
        const existingIndex = message.contentItems.findIndex(
          (item) => item.type === "tool" && item.toolCallId === data.toolCallId
        );
        
        if (existingIndex >= 0) {
          // 更新已存在的工具调用
          (message.contentItems[existingIndex] as any).paramsText = data.paramsText;
        } else {
          // 添加新工具调用
          message.contentItems.push({
            type: "tool",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            paramsText: data.paramsText,
          });
        }
      } else if (data.type === "tool_use") {
        // 查找是否已存在相同的 toolCallId
        const existingIndex = message.contentItems.findIndex(
          (item) => item.type === "tool" && item.toolCallId === data.toolCallId
        );
        
        if (existingIndex >= 0) {
          // 更新已存在的工具调用
          (message.contentItems[existingIndex] as any).params = data.params;
        } else {
          // 添加新工具调用
          message.contentItems.push({
            type: "tool",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            params: data.params,
          });
        }
      } else if (data.type === "tool_running") {
        // 查找是否已存在相同的 toolCallId
        const existingIndex = message.contentItems.findIndex(
          (item) => item.type === "tool" && item.toolCallId === data.toolCallId
        );
        
        if (existingIndex >= 0) {
          // 更新已存在的工具调用
          (message.contentItems[existingIndex] as any).running = !data.streamDone;
          (message.contentItems[existingIndex] as any).runningText = data.text;
        } else {
          // 添加新工具调用
          message.contentItems.push({
            type: "tool",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            running: true,
            runningText: data.text,
          });
        }
      } else if (data.type === "tool_result") {
        // 查找是否已存在相同的 toolCallId
        const existingIndex = message.contentItems.findIndex(
          (item) => item.type === "tool" && item.toolCallId === data.toolCallId
        );
        
        if (existingIndex >= 0) {
          // 更新已存在的工具调用
          (message.contentItems[existingIndex] as any).result = data.toolResult;
          (message.contentItems[existingIndex] as any).running = false;
        } else {
          // 添加新工具调用
          message.contentItems.push({
            type: "tool",
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            params: data.params,
            result: data.toolResult,
          });
        }

        // 如果是 deepAction 工具，在工具项之后添加 task 项
        if (data.toolName === "deepAction") {
          const taskId = (data.params as any)?.taskId || uuidv4();
          // 检查是否已经存在 task 项
          const taskIndex = message.contentItems.findIndex(
            (item) => item.type === "task" && item.taskId === taskId
          );
          
          if (taskIndex < 0) {
            // 在工具项之后添加 task 项
            const toolIndex = message.contentItems.findIndex(
              (item) => item.type === "tool" && item.toolCallId === data.toolCallId
            );
            const insertIndex = toolIndex >= 0 ? toolIndex + 1 : message.contentItems.length;
            message.contentItems.splice(insertIndex, 0, {
              type: "task",
              taskId: taskId,
              task: {
                taskId: taskId,
                agents: [],
              },
            });
          }
        }
      } else if (data.type === "error") {
        message.error = data.error;
        // 隐藏停止按钮
        if (data.messageId === currentMessageId) {
          setCurrentMessageId(null);
        }
      } else if (data.type === "finish") {
        message.usage = data.usage;
        // 隐藏停止按钮
        if (data.messageId === currentMessageId) {
          setCurrentMessageId(null);
        }
      }

      return newMessages;
    });
  }, [currentMessageId]);

  // 处理 task 回调
  const handleTaskCallback = useCallback((data: AgentStreamMessage & { messageId: string }) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const message = newMessages.find((m) => m.id === `ai-${data.messageId}`);

      if (!message) return prev;

      // 查找对应的 task 项
      const taskItemIndex = message.contentItems.findIndex(
        (item) => item.type === "task" && item.taskId === data.taskId
      );

      if (taskItemIndex < 0) {
        // 如果不存在，创建一个新的 task 项
        message.contentItems.push({
          type: "task",
          taskId: data.taskId,
          task: {
            taskId: data.taskId,
            agents: [],
          },
        });
      }

      const taskItem = message.contentItems.find(
        (item) => item.type === "task" && item.taskId === data.taskId
      ) as { type: "task"; taskId: string; task: TaskData } | undefined;

      if (!taskItem) return prev;

      if (data.type === "workflow") {
        taskItem.task.workflow = data.workflow;
        taskItem.task.workflowStreamDone = data.streamDone;
      } else if (data.type === "agent_start") {
        // 检查是否已存在该 agent
        const existingAgent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        
        if (!existingAgent) {
          const agentExecution: AgentExecution = {
            agentNode: data.agentNode,
            contentItems: [],
            status: "running",
          };
          taskItem.task.agents.push(agentExecution);
        }
      } else if (data.type === "text" || data.type === "thinking") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        if (agent) {
          // 查找是否已存在相同的 streamId
          const existingIndex = agent.contentItems.findIndex(
            (item) => 
              (item.type === "text" || item.type === "thinking") && 
              item.streamId === data.streamId
          );
          
          if (existingIndex >= 0) {
            // 更新已存在的项
            (agent.contentItems[existingIndex] as any).text = data.text;
            (agent.contentItems[existingIndex] as any).streamDone = data.streamDone;
          } else {
            // 添加新项
            agent.contentItems.push({
              type: data.type,
              streamId: data.streamId,
              text: data.text,
              streamDone: data.streamDone,
            });
          }
        }
      } else if (data.type === "file") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        if (agent) {
          agent.contentItems.push({
            type: "file",
            mimeType: data.mimeType,
            data: data.data,
          });
        }
      } else if (data.type === "tool_streaming") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        if (agent) {
          // 查找是否已存在相同的 toolCallId
          const existingIndex = agent.contentItems.findIndex(
            (item) => item.type === "tool" && item.toolCallId === data.toolCallId
          );
          
          if (existingIndex >= 0) {
            // 更新已存在的工具调用
            (agent.contentItems[existingIndex] as any).paramsText = data.paramsText;
          } else {
            // 添加新工具调用
            agent.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              paramsText: data.paramsText,
            });
          }
        }
      } else if (data.type === "tool_use") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        if (agent) {
          // 查找是否已存在相同的 toolCallId
          const existingIndex = agent.contentItems.findIndex(
            (item) => item.type === "tool" && item.toolCallId === data.toolCallId
          );
          
          if (existingIndex >= 0) {
            // 更新已存在的工具调用
            (agent.contentItems[existingIndex] as any).params = data.params;
          } else {
            // 添加新工具调用
            agent.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
            });
          }
        }
      } else if (data.type === "tool_running") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        if (agent) {
          // 查找是否已存在相同的 toolCallId
          const existingIndex = agent.contentItems.findIndex(
            (item) => item.type === "tool" && item.toolCallId === data.toolCallId
          );
          
          if (existingIndex >= 0) {
            // 更新已存在的工具调用
            (agent.contentItems[existingIndex] as any).running = !data.streamDone;
            (agent.contentItems[existingIndex] as any).runningText = data.text;
          } else {
            // 添加新工具调用
            agent.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              running: true,
              runningText: data.text,
            });
          }
        }
      } else if (data.type === "tool_result") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        if (agent) {
          // 查找是否已存在相同的 toolCallId
          const existingIndex = agent.contentItems.findIndex(
            (item) => item.type === "tool" && item.toolCallId === data.toolCallId
          );
          
          if (existingIndex >= 0) {
            // 更新已存在的工具调用
            (agent.contentItems[existingIndex] as any).result = data.toolResult;
            (agent.contentItems[existingIndex] as any).running = false;
          } else {
            // 添加新工具调用
            agent.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
              result: data.toolResult,
            });
          }
        }
      } else if (data.type === "agent_result") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
        if (agent) {
          agent.status = data.error ? "error" : "done";
          agent.result = data.result;
          agent.error = data.error;
        }
      } else if (data.type === "error") {
        const agent = taskItem.task.agents.find(
          (a) => a.agentNode.id === (data.nodeId || data.agentName) || 
                 a.agentNode.name === data.agentName
        );
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
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleChatCallback, handleTaskCallback]);

  // 上传文件到服务器
  const uploadFile = useCallback(async (file: UploadedFile): Promise<{ fileId: string; url: string }> => {
    return new Promise((resolve, reject) => {

      const timer = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject('Upload timeout');
      }, 180_000);

      const requestId = uuidv4();
      
      // 先设置监听器
      const listener = (message: any) => {
        if (message.type === "uploadFile_result" && message.requestId === requestId) {
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          if (!message.data || message.data.error) {
            reject(new Error(message.data.error || "Upload failed"));
          } else {
            resolve(message.data);
          }
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      
      // 发送上传请求
      chrome.runtime.sendMessage(
        {
          requestId,
          type: "uploadFile",
          data: {
            base64Data: file.base64Data,
            mimeType: file.mimeType,
            filename: file.filename,
          },
        }
      );
    });
  }, []);

  // 发送消息
  const sendMessage = useCallback(async () => {
    if ((!inputValue.trim() && uploadedFiles.length === 0) || sending) return;

    const messageId = uuidv4();
    
    // 上传文件
    const fileParts: Array<{ type: "file"; fileId: string; filename?: string; mimeType: string; data: string }> = [];
    for (const file of uploadedFiles) {
      try {
        const { fileId, url } = await uploadFile(file);
        file.fileId = fileId;
        file.url = url;
        fileParts.push({
          type: "file",
          fileId,
          filename: file.filename,
          mimeType: file.mimeType,
          data: file.base64Data,
        });
        console.log("fileParts: ", fileParts);
      } catch (error) {
        console.error("Error uploading file:", error);
      }
    }

    // 构建用户消息内容
    const userParts: Array<{ type: "text"; text: string } | { type: "file"; fileId: string; filename?: string; mimeType: string; data: string }> = [];
    if (inputValue.trim()) {
      userParts.push({ type: "text", text: inputValue });
    }
    userParts.push(...fileParts);

    const userMessage: ChatMessage = {
      id: messageId,
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
      contentItems: [],
      files: [...uploadedFiles],
      loading: true, // 显示 loading
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setUploadedFiles([]);
    setSending(true);
    setCurrentMessageId(messageId); // 设置当前消息 ID，显示停止按钮

    try {
      chrome.runtime.sendMessage(
        {
          requestId: uuidv4(),
          type: "chat",
          data: {
            messageId: messageId,
            user: userParts,
          },
        }
      );
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  }, [inputValue, uploadedFiles, sending, uploadFile]);

  // 停止消息
  const stopMessage = (messageId: string) => {
    chrome.runtime.sendMessage({
      type: "stop",
      data: { messageId },
    });
    setCurrentMessageId(null);
  };

  // 将文件转换为 base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 处理文件选择
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64Data = await fileToBase64(file);
      newFiles.push({
        id: uuidv4(),
        file,
        base64Data,
        mimeType: file.type,
        filename: file.name,
      });
    }
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    
    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 删除文件
  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // 渲染单个文本项
  const renderTextItem = (item: { type: "text"; streamId: string; text: string; streamDone: boolean }) => {
    return (
      <div style={{ marginBottom: 8 }}>
        <MarkdownRenderer content={item.text} />
        {!item.streamDone && (
          <Spin size="small" style={{ color: "white" }} />
        )}
      </div>
    );
  };

  // 渲染单个思考项
  const renderThinkingItem = (item: { type: "thinking"; streamId: string; text: string; streamDone: boolean }) => {
    return (
      <Collapse
        size="small"
        style={{ marginBottom: 8 }}
        defaultActiveKey={item.streamDone ? [] : ['thinking']}
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
                {item.text}
                {!item.streamDone && (
                  <span className="streaming-cursor">|</span>
                )}
              </Paragraph>
            ),
          },
        ]}
      />
    );
  };

  // 渲染工具调用
  const renderToolCallItem = (item: ChatContentItem & { type: "tool" }) => {
    return (
      <Card
        size="small"
        style={{ marginTop: 8, backgroundColor: "#f5f5f5" }}
        title={
          <Space>
            <ToolOutlined />
            <Text strong>{item.toolName}</Text>
            {item.running && <Spin size="small" />}
            {item.result && (
              <Tag
                color={item.result.isError ? "red" : "green"}
                icon={
                  item.result.isError ? (
                    <CloseCircleOutlined />
                  ) : (
                    <CheckCircleOutlined />
                  )
                }
              >
                {item.result.isError ? "失败" : "完成"}
              </Tag>
            )}
          </Space>
        }
      >
        {item.paramsText && !item.params && (
          <Text type="secondary" code>
            {item.paramsText}
            <span className="streaming-cursor">|</span>
          </Text>
        )}
        {item.params && (
          <Collapse
            size="small"
            defaultActiveKey={['params']}
            items={[
              {
                key: "params",
                label: "参数",
                children: (
                  <pre style={{ margin: 0, fontSize: 12 }}>
                    {JSON.stringify(item.params, null, 2)}
                  </pre>
                ),
              },
            ]}
          />
        )}
        {item.running && item.runningText && (
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {item.runningText}
            {!item.running && <span className="streaming-cursor">|</span>}
          </Paragraph>
        )}
        {item.result && (
          <Collapse
            size="small"
            style={{ marginTop: 8 }}
            defaultActiveKey={item.result.isError ? ['result'] : []}
            items={[
              {
                key: "result",
                label: (
                  <Space>
                    <Text>结果</Text>
                    {item.result.isError &&
                      <Tag
                        color="red"
                        icon={
                          <CloseCircleOutlined />
                        }
                      >失败</Tag>
                    }
                  </Space>
                ),
                children: (
                  <div>
                    {item.result.content.map((part, index) => {
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
                ),
              },
            ]}
          />
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
    const agent = task.agents.find(
      (a) => a.agentNode.id === agentNode.id || a.agentNode.name === agentNode.name
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
                    {renderThinkingItem(item)}
                  </div>
                );
              } else if (item.type === "text") {
                return (
                  <div key={`text-${item.streamId}-${index}`}>
                    {renderTextItem(item)}
                  </div>
                );
              } else if (item.type === "tool") {
                return (
                  <div key={`tool-${item.toolCallId}-${index}`} style={{ marginBottom: 8 }}>
                    {renderToolCallItem(item)}
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
                            style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 4 }}
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
          {message.contentItems && message.contentItems.length > 0 ? (
            message.contentItems.map((item, index) => {
              if (item.type === "thinking") {
                return (
                  <div key={`chat-thinking-${item.streamId}-${index}`}>
                    {renderThinkingItem(item)}
                  </div>
                );
              } else if (item.type === "text") {
                return (
                  <div key={`chat-text-${item.streamId}-${index}`}>
                    {renderTextItem(item)}
                  </div>
                );
              } else if (item.type === "tool") {
                return (
                  <div key={`chat-tool-${item.toolCallId}-${index}`} style={{ marginBottom: 8 }}>
                    {renderToolCallItem(item)}
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
                  <div key={`chat-task-${item.taskId}-${index}`} style={{ marginBottom: 8 }}>
                    {renderWorkflow(item.task)}
                  </div>
                );
              }
              return null;
            })
          ) : (
            message.content && (
              <div style={{ marginBottom: 8 }}>
                <MarkdownRenderer content={message.content} />
              </div>
            )
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
        {/* 已上传的文件列表 */}
        {uploadedFiles.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Space wrap>
              {uploadedFiles.map((file) => {
                const isImage = file.mimeType.startsWith("image/");
                return (
                  <div
                    key={file.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 8px",
                      backgroundColor: "#f5f5f5",
                      borderRadius: 4,
                      border: "1px solid #d9d9d9",
                    }}
                  >
                    {isImage ? (
                      <Image
                        src={`data:${file.mimeType};base64,${file.base64Data}`}
                        alt={file.filename}
                        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, marginRight: 8 }}
                        preview={false}
                      />
                    ) : (
                      <FileOutlined style={{ marginRight: 8, fontSize: 16 }} />
                    )}
                    <Text style={{ fontSize: 12, marginRight: 8, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.filename}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeFile(file.id)}
                      style={{ padding: 0, width: 20, height: 20 }}
                    />
                  </div>
                );
              })}
            </Space>
          </div>
        )}
        <Space.Compact style={{ width: "100%" }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.docx,.xlsx,.txt,.md,.json"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <Button
            icon={<PaperClipOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || currentMessageId !== null}
          />
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="输入消息..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ flex: 1, margin: "0 4px" }}
            disabled={sending || currentMessageId !== null}
          />
          {currentMessageId ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={() => {
                if (currentMessageId) {
                  stopMessage(currentMessageId);
                }
              }}
            >
              停止
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendMessage}
              loading={sending}
              disabled={(!inputValue.trim() && uploadedFiles.length === 0) || sending}
            >
              发送
            </Button>
          )}
        </Space.Compact>
      </div>

      <style>{`
        body {
          margin: 0 !important;
        }
        .streaming-cursor {
          animation: blink 1s infinite;
          color: black;
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
