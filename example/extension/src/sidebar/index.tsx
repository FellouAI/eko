import "./index.css";
import { uuidv4 } from "@eko-ai/eko";
import { createRoot } from "react-dom/client";
import { ChatInput } from "./components/ChatInput";
import { Empty, message as AntdMessage, Button, Tooltip } from "antd";
import { ClearOutlined } from "@ant-design/icons";
import { useFileUpload } from "./hooks/useFileUpload";
import { MessageItem } from "./components/MessageItem";
import type { ChatMessage, UploadedFile } from "./types";
import { useChatCallbacks } from "./hooks/useChatCallbacks";
import React, { useState, useRef, useEffect, useCallback } from "react";

const AppRun = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { handleChatCallback, handleTaskCallback } = useChatCallbacks(
    setMessages,
    currentMessageId,
    setCurrentMessageId
  );
  const { fileToBase64, uploadFile } = useFileUpload();

  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 200;
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return scrollBottom < threshold;
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setAutoScroll(isNearBottom());
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [isNearBottom]);

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  // Listen to background messages
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
      } else if (message.type === "chat_result") {
        const messageId = message.data.messageId;
        const error = message.data.error;
        if (error && messageId === currentMessageId) {
          setCurrentMessageId(null);
          const userMessage = messages.find((m) => m.id === messageId);
          if (userMessage) {
            userMessage.status = "error";
          }
        }
      } else if (message.type === "log") {
        const level = message.data.level;
        const msg = message.data.message;
        const showMessage =
          level === "error"
            ? AntdMessage.error
            : level === "success"
            ? AntdMessage.success
            : AntdMessage.info;
        showMessage(msg, 3);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleChatCallback, handleTaskCallback, currentMessageId]);

  // Send message
  const sendMessage = useCallback(async () => {
    if ((!inputValue.trim() && uploadedFiles.length === 0) || sending) return;

    const messageId = uuidv4();

    // Upload files
    const fileParts: Array<{
      type: "file";
      fileId: string;
      filename?: string;
      mimeType: string;
      data: string;
    }> = [];
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
          data: url.startsWith("http") ? url : file.base64Data,
        });
      } catch (error) {
        console.error("Error uploading file:", error);
      }
    }

    // Build user message content
    const userParts: Array<
      | { type: "text"; text: string }
      | {
          type: "file";
          fileId: string;
          filename?: string;
          mimeType: string;
          data: string;
        }
    > = [];
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
      uploadedFiles: [...uploadedFiles],
      status: "waiting",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setUploadedFiles([]);
    setSending(true);
    setCurrentMessageId(messageId);

    try {
      chrome.runtime.sendMessage({
        requestId: uuidv4(),
        type: "chat",
        data: {
          user: userParts,
          messageId: messageId,
          windowId: (await chrome.windows.getCurrent()).id,
        },
      });
    } catch (error) {
      userMessage.status = "error";
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  }, [inputValue, uploadedFiles, sending, uploadFile]);

  // Stop message
  const stopMessage = useCallback((messageId: string) => {
    chrome.runtime.sendMessage({
      type: "stop",
      data: { messageId },
    });
    setCurrentMessageId(null);
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [fileToBase64]
  );

  // Remove file
  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleStop = useCallback(() => {
    if (currentMessageId) {
      stopMessage(currentMessageId);
    }
  }, [currentMessageId, stopMessage]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentMessageId(null);
    chrome.runtime.sendMessage({
      type: "clear_messages",
    });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#ffffff",
      }}
    >
      {/* Message area */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "16px",
          backgroundColor: "#f5f5f5",
          position: "relative",
        }}
      >
        {messages.length > 0 && (
          <Tooltip title="Clear messages" placement="left">
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined />}
              onClick={clearMessages}
              style={{
                position: "absolute",
                top: "6px",
                zIndex: 999,
                width: "32px",
                height: "32px",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          </Tooltip>
        )}
        {messages.length === 0 ? (
          <Empty
            description="Start a conversation!"
            style={{ marginTop: "20vh" }}
          />
        ) : (
          messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSend={sendMessage}
        onStop={handleStop}
        onFileSelect={handleFileSelect}
        onRemoveFile={removeFile}
        uploadedFiles={uploadedFiles}
        sending={sending}
        currentMessageId={currentMessageId}
      />
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <AppRun />
  </React.StrictMode>
);
