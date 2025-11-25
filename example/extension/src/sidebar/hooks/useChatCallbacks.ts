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
        let message = newMessages.find((m) => m.id === aiMessageId);

        // If AI message doesn't exist, create it
        if (!message) {
          // Ensure corresponding user message exists
          const userMessage = newMessages.find((m) => m.id === data.messageId);
          if (!userMessage) {
            // User message doesn't exist, might be message order issue, return early
            return prev;
          }
          // Clear user message loading state
          userMessage.loading = false;
          // Create AI message
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

        // Handle different types of callbacks
        if (data.type === "text" || data.type === "thinking") {
          // Check if item with same streamId already exists
          const existingIndex = message.contentItems.findIndex(
            (item) =>
              (item.type === "text" || item.type === "thinking") &&
              item.streamId === data.streamId
          );

          if (existingIndex >= 0) {
            // Update existing item
            (message.contentItems[existingIndex] as any).text = data.text;
            (message.contentItems[existingIndex] as any).streamDone =
              data.streamDone;
          } else {
            // Add new item
            message.contentItems.push({
              type: data.type,
              streamId: data.streamId,
              text: data.text,
              streamDone: data.streamDone,
            });
          }

          // Update content to latest text
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
          // Check if tool call with same toolCallId already exists
          const existingIndex = message.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            // Update existing tool call
            (message.contentItems[existingIndex] as any).paramsText =
              data.paramsText;
          } else {
            // Add new tool call
            message.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              paramsText: data.paramsText,
            });
          }
        } else if (data.type === "tool_use") {
          // Check if tool call with same toolCallId already exists
          const existingIndex = message.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            // Update existing tool call
            (message.contentItems[existingIndex] as any).params = data.params;
          } else {
            // Add new tool call
            message.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
            });
          }
        } else if (data.type === "tool_running") {
          // Check if tool call with same toolCallId already exists
          const existingIndex = message.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            // Update existing tool call
            (message.contentItems[existingIndex] as any).running =
              !data.streamDone;
            (message.contentItems[existingIndex] as any).runningText =
              data.text;
          } else {
            // Add new tool call
            message.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              running: true,
              runningText: data.text,
            });
          }
        } else if (data.type === "tool_result") {
          // Check if tool call with same toolCallId already exists
          const existingIndex = message.contentItems.findIndex(
            (item) =>
              item.type === "tool" && item.toolCallId === data.toolCallId
          );

          if (existingIndex >= 0) {
            // Update existing tool call
            (message.contentItems[existingIndex] as any).result =
              data.toolResult;
            (message.contentItems[existingIndex] as any).running = false;
          } else {
            // Add new tool call
            message.contentItems.push({
              type: "tool",
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              params: data.params,
              result: data.toolResult,
            });
          }

          // If it's a deepAction tool, add task item after tool item
          if (data.toolName === "deepAction") {
            const taskId = (data.params as any)?.taskId || uuidv4();
            // Check if task item already exists
            const taskIndex = message.contentItems.findIndex(
              (item) => item.type === "task" && item.taskId === taskId
            );

            if (taskIndex < 0) {
              // Add task item after tool item
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
          // Hide stop button
          if (data.messageId === currentMessageId) {
            setCurrentMessageId(null);
          }
        } else if (data.type === "finish") {
          message.usage = data.usage;
          // Hide stop button
          if (data.messageId === currentMessageId) {
            setCurrentMessageId(null);
          }
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

        // Find corresponding task item
        const taskItemIndex = message.contentItems.findIndex(
          (item) => item.type === "task" && item.taskId === data.taskId
        );

        if (taskItemIndex < 0) {
          // If doesn't exist, create a new task item
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
          // Check if agent already exists
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
            // Check if item with same streamId already exists
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                (item.type === "text" || item.type === "thinking") &&
                item.streamId === data.streamId
            );

            if (existingIndex >= 0) {
              // Update existing item
              (agent.contentItems[existingIndex] as any).text = data.text;
              (agent.contentItems[existingIndex] as any).streamDone =
                data.streamDone;
            } else {
              // Add new item
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
            // Check if tool call with same toolCallId already exists
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              // Update existing tool call
              (agent.contentItems[existingIndex] as any).paramsText =
                data.paramsText;
            } else {
              // Add new tool call
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
            // Check if tool call with same toolCallId already exists
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              // Update existing tool call
              (agent.contentItems[existingIndex] as any).params = data.params;
            } else {
              // Add new tool call
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
            // Check if tool call with same toolCallId already exists
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              // Update existing tool call
              (agent.contentItems[existingIndex] as any).running =
                !data.streamDone;
              (agent.contentItems[existingIndex] as any).runningText =
                data.text;
            } else {
              // Add new tool call
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
            // Check if tool call with same toolCallId already exists
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                item.type === "tool" && item.toolCallId === data.toolCallId
            );

            if (existingIndex >= 0) {
              // Update existing tool call
              (agent.contentItems[existingIndex] as any).result =
                data.toolResult;
              (agent.contentItems[existingIndex] as any).running = false;
            } else {
              // Add new tool call
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
        } else if (
          (data as any).type === "human_confirm" ||
          (data as any).type === "human_input" ||
          (data as any).type === "human_select" ||
          (data as any).type === "human_help"
        ) {
          const humanData = data as any;
          const agent = taskItem.task.agents.find(
            (a) =>
              a.agentNode.id === (humanData.nodeId || humanData.agentName) ||
              a.agentNode.name === humanData.agentName
          );
          if (agent) {
            // Check if item with same callbackId already exists
            const existingIndex = agent.contentItems.findIndex(
              (item) =>
                (item.type === "human_confirm" ||
                  item.type === "human_input" ||
                  item.type === "human_select" ||
                  item.type === "human_help") &&
                (item as any).callbackId === humanData.callbackId
            );

            if (existingIndex >= 0) {
              // Update existing item (shouldn't happen, but just in case)
              agent.contentItems[existingIndex] = {
                ...humanData,
                responded: false,
              };
            } else {
              // Add new item
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
