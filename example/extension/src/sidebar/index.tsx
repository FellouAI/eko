import "./index.css";
import { uuidv4 } from "@eko-ai/eko";
import { createRoot } from "react-dom/client";
import { ChatInput } from "./components/ChatInput";
import { message as AntdMessage } from "antd";
import { useFileUpload } from "./hooks/useFileUpload";
import { MessageItem } from "./components/MessageItem";
import type { ChatMessage, UploadedFile } from "./types";
import { useChatCallbacks } from "./hooks/useChatCallbacks";
import React, { useState, useRef, useEffect, useCallback } from "react";

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

const PinIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"></line>
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
  </svg>
);

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const AppRun = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { handleChatCallback, handleTaskCallback } = useChatCallbacks(
    setMessages,
    currentMessageId,
    setCurrentMessageId
  );
  const { fileToBase64, uploadFile } = useFileUpload();

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
          messageId: messageId,
          user: userParts,
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

  const openSettings = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  const closeSidebar = useCallback(() => {
    window.close();
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <div className="app-header">
        <div className="app-logo">Browseless.ai</div>
        <div className="header-buttons">
          <button
            className="header-btn"
            onClick={openSettings}
            title="Settings"
          >
            <SettingsIcon />
          </button>
          <button
            className="header-btn"
            title="Pin sidebar"
          >
            <PinIcon />
          </button>
          <button
            className="header-btn"
            onClick={closeSidebar}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Message area */}
      <div ref={messagesContainerRef} className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <span className="empty-text">Start a conversation</span>
          </div>
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
