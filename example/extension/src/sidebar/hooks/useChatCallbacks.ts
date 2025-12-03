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
  // Handle chat callbacks
  const handleChatCallback = useCallback(
    (data: ChatStreamMessage) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        const aiMessageId = `ai-${data.messageId}`;
        let aiMessage = newMessages.find((m) => m.id === aiMessageId);

        if (!aiMessage) {
          const userMessage = newMessages.find((m) => m.id === data.messageId);
          if (!userMessage) {
            // User message doesn't exist, might be message order issue, return early
            return prev;
          }
          userMessage.status = "running";
          const _aiMessage: ChatMessage = {
            id: aiMessageId,
            role: "assistant",
            content: "",
            status: "waiting",
            timestamp: Date.now(),
            contentItems: [],
          };
          newMessages.push(_aiMessage);
          aiMessage = _aiMessage;
        }

        if (!aiMessage.contentItems) {
          aiMessage.contentItems = [];
        }

        // Handle different types of callbacks
        if (data.type === "chat_start") {
          if (data.messageId !== currentMessageId) {
            setCurrentMessageId(data.messageId);
          }
        } else {
          aiMessage.status = "running";
        }
        if (data.type === "text" || data.type === "thinking") {
          const existingIndex = aiMessage.contentItems.findIndex(
            (item) =>
              (item.type === "text" || item.type === "thinking") &&
              item.streamId === data.streamId
          );

          if (existingIndex >= 0) {
            (aiMessage.contentItems[existingIndex] as any).text = data.text;
            (aiMessage.contentItems[existingIndex] as any).streamDone =
              data.streamDone;
          } else {
            aiMessage.contentItems.push({
              type: data.type,
              streamId: data.streamId,
              text: data.text,
              streamDone: data.streamDone,
            });
          }

          if (data.type === "text" && data.streamDone) {
            aiMessage.content = data.text;
          }
        } else if (data.type === "file") {
          aiMessage.contentItems.push({
            type: "file",
            mimeType: data.mimeType,
            data: data.data,
          });
        } else if (data.type === "tool_streaming") {
          const existingIndex = aiMessage.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            (aiMessage.contentItems[existingIndex] as any).paramsText =
              data.paramsText;
          } else {
            aiMessage.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              paramsText: data.paramsText,
            });
          }
        } else if (data.type === "tool_use") {
          const existingIndex = aiMessage.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            (aiMessage.contentItems[existingIndex] as any).params = data.params;
          } else {
            aiMessage.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
            });
          }
        } else if (data.type === "tool_running") {
          const existingIndex = aiMessage.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            (aiMessage.contentItems[existingIndex] as any).running =
              !data.streamDone;
            (aiMessage.contentItems[existingIndex] as any).runningText =
              data.text;
          } else {
            aiMessage.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              running: true,
              runningText: data.text,
            });
          }
        } else if (data.type === "tool_result") {
          const existingIndex = aiMessage.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            (aiMessage.contentItems[existingIndex] as any).result =
              data.toolResult;
            (aiMessage.contentItems[existingIndex] as any).running = false;
          } else {
            aiMessage.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
              result: data.toolResult,
            });
          }

          if (data.toolName === "deepAction") {
            const taskId = (data.params as any)?.taskId || uuidv4();
            const taskIndex = aiMessage.contentItems.findIndex(
              (item) => item.type === "task" && item.taskId === taskId
            );

            if (taskIndex < 0) {
              const toolIndex = aiMessage.contentItems.findIndex(
                (item) =>
                  item.type === "tool" && item.toolCallId === data.toolCallId
              );
              const insertIndex =
                toolIndex >= 0 ? toolIndex + 1 : aiMessage.contentItems.length;
              aiMessage.contentItems.splice(insertIndex, 0, {
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
          aiMessage.error = data.error;
        } else if (data.type === "finish") {
          aiMessage.usage = data.usage;
        } else if (data.type == "chat_end") {
          if (data.messageId === currentMessageId) {
            setCurrentMessageId(null);
          }
          const userMessage = newMessages.find((m) => m.id === data.messageId);
          if (userMessage) {
            userMessage.status = data.error ? "error" : "done";
          }
          aiMessage.error = data.error;
          if (aiMessage.status != "terminated") {
            aiMessage.status = data.error ? "error" : "done";
          }
          aiMessage.contentItems.forEach((item) => {
            if (item.type == "text" || item.type == "thinking") {
              item.streamDone = true;
            } else if (item.type == "tool") {
              item.running = false;
            } else if (item.type == "task") {
              const task = item.task;
              task.workflowStreamDone = true;
              task.agents.forEach((agent) => {
                if (agent.status == "running") {
                  agent.status = data.error ? "error" : "done";
                }
                agent.contentItems.forEach((contentItem) => {
                  if (
                    contentItem.type == "text" ||
                    contentItem.type == "thinking"
                  ) {
                    contentItem.streamDone = true;
                  } else if (contentItem.type == "tool") {
                    contentItem.running = false;
                  }
                });
              });
            }
          });
        }

        return newMessages;
      });
    },
    [currentMessageId, setCurrentMessageId, setMessages]
  );

  // Handle task callbacks
  const handleTaskCallback = useCallback(
    (data: AgentStreamMessage & { messageId: string }) => {
      setMessages((prev) => {
        const newMessages = [...prev];
        const message = newMessages.find(
          (m) => m.id === `ai-${data.messageId}`
        );

        if (!message) return prev;

        const taskItemIndex = message.contentItems.findIndex(
          (item) => item.type === "task" && item.taskId === data.taskId
        );

        if (taskItemIndex < 0) {
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
          const existingAgent = taskItem.task.agents.find(
            (a) => a.agentNode.id === data.nodeId
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
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                (item.type === "text" || item.type === "thinking") &&
                item.streamId === data.streamId
            );

            if (existingIndex >= 0) {
              (agent.contentItems[existingIndex] as any).text = data.text;
              (agent.contentItems[existingIndex] as any).streamDone =
                data.streamDone;
            } else {
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
            (a) => a.agentNode.id === data.nodeId
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
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              (agent.contentItems[existingIndex] as any).paramsText =
                data.paramsText;
            } else {
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
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              (agent.contentItems[existingIndex] as any).params = data.params;
            } else {
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
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              (agent.contentItems[existingIndex] as any).running =
                !data.streamDone;
              (agent.contentItems[existingIndex] as any).runningText =
                data.text;
            } else {
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
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              (agent.contentItems[existingIndex] as any).result =
                data.toolResult;
              (agent.contentItems[existingIndex] as any).running = false;
            } else {
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
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            agent.status = data.error ? "error" : "done";
            agent.result = data.result;
            agent.error = data.error;
          }
        } else if (data.type === "error") {
          const agent = taskItem.task.agents.find(
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            agent.status = "error";
            agent.error = data.error;
          }
        } else if (
          (data as any).type === "human_confirm" ||
          (data as any).type === "human_input" ||
          (data as any).type === "human_select" ||
          (data as any).type === "human_help"
        ) {
          const humanData = data as any;
          const agent = taskItem.task.agents.find(
            (a) => a.agentNode.id === data.nodeId
          );
          if (agent) {
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type.startsWith("human_") &&
                (item as any).callbackId === humanData.callbackId
            );

            if (existingIndex >= 0) {
              agent.contentItems[existingIndex] = {
                ...humanData,
                responded: false,
              };
            } else {
              agent.contentItems.push({
                ...humanData,
                responded: false,
              });
            }
          }
        }

        return newMessages;
      });
    },
    [setMessages]
  );

  return { handleChatCallback, handleTaskCallback };
};
