import React from "react";
import type {
  TaskData,
  ChatMessage,
  AgentExecution,
  ChatStreamMessage,
  AgentStreamMessage,
} from "../types";
import { useCallback } from "react";
import { uuidv4 } from "@eko-ai/eko";

export const useChatCallbacks = (
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  currentMessageId: string | null,
  setCurrentMessageId: React.Dispatch<React.SetStateAction<string | null>>
) => {
  // 处理 chat 回调
  const handleChatCallback = useCallback(
    (data: ChatStreamMessage) => {
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
            (message.contentItems[existingIndex] as any).streamDone =
              data.streamDone;
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
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            // 更新已存在的工具调用
            (message.contentItems[existingIndex] as any).paramsText =
              data.paramsText;
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
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
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
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            // 更新已存在的工具调用
            (message.contentItems[existingIndex] as any).running =
              !data.streamDone;
            (message.contentItems[existingIndex] as any).runningText =
              data.text;
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
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            // 更新已存在的工具调用
            (message.contentItems[existingIndex] as any).result =
              data.toolResult;
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
                (item) =>
                  item.type === "tool" && item.toolCallId === data.toolCallId
              );
              const insertIndex =
                toolIndex >= 0 ? toolIndex + 1 : message.contentItems.length;
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
    },
    [currentMessageId, setCurrentMessageId, setMessages]
  );

  // 处理 task 回调
  const handleTaskCallback = useCallback(
    (data: AgentStreamMessage & { messageId: string }) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        const message = newMessages.find(
          (m) => m.id === `ai-${data.messageId}`
        );

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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
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
              (agent.contentItems[existingIndex] as any).streamDone =
                data.streamDone;
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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
              a.agentNode.name === data.agentName
          );
          if (agent) {
            // 查找是否已存在相同的 toolCallId
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              // 更新已存在的工具调用
              (agent.contentItems[existingIndex] as any).paramsText =
                data.paramsText;
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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
              a.agentNode.name === data.agentName
          );
          if (agent) {
            // 查找是否已存在相同的 toolCallId
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
              a.agentNode.name === data.agentName
          );
          if (agent) {
            // 查找是否已存在相同的 toolCallId
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              // 更新已存在的工具调用
              (agent.contentItems[existingIndex] as any).running =
                !data.streamDone;
              (agent.contentItems[existingIndex] as any).runningText =
                data.text;
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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
              a.agentNode.name === data.agentName
          );
          if (agent) {
            // 查找是否已存在相同的 toolCallId
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              // 更新已存在的工具调用
              (agent.contentItems[existingIndex] as any).result =
                data.toolResult;
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
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
              a.agentNode.name === data.agentName
          );
          if (agent) {
            agent.status = data.error ? "error" : "done";
            agent.result = data.result;
            agent.error = data.error;
          }
        } else if (data.type === "error") {
          const agent = taskItem.task.agents.find(
            (a) =>
              a.agentNode.id === (data.nodeId || data.agentName) ||
              a.agentNode.name === data.agentName
          );
          if (agent) {
            agent.status = "error";
            agent.error = data.error;
          }
        }

        return newMessages;
      });
    },
    [setMessages]
  );

  return { handleChatCallback, handleTaskCallback };
};
