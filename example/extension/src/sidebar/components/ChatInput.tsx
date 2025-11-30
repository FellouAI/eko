import React, { useRef, useCallback, useEffect } from "react";
import { FileOutlined, DeleteOutlined } from "@ant-design/icons";
import type { UploadedFile } from "../types";
import { Image, Typography } from "antd";

const { Text } = Typography;

// Plus icon for file attachment
const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

// Arrow up icon for send
const ArrowUpIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"></line>
    <polyline points="5 12 12 5 19 12"></polyline>
  </svg>
);

// Stop icon
const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"></rect>
  </svg>
);

interface ChatInputProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (fileId: string) => void;
  uploadedFiles: UploadedFile[];
  sending: boolean;
  currentMessageId: string | null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onStop,
  onFileSelect,
  onRemoveFile,
  uploadedFiles,
  sending,
  currentMessageId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isProcessing = currentMessageId !== null;
  const canSend = (inputValue.trim() || uploadedFiles.length > 0) && !sending && !isProcessing;

  // Auto-resize textarea - starts compact, grows as needed
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset to auto to get accurate scrollHeight
      textarea.style.height = 'auto';
      const minHeight = 24; // Very compact start
      const maxHeight = 160;
      const scrollHeight = textarea.scrollHeight;
      // Only grow, never start large
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Initial height set on mount - start compact
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
  };

  return (
    <div className="chat-input-wrapper">
      {/* Uploaded files preview */}
      {uploadedFiles.length > 0 && (
        <div className="uploaded-files-preview">
          {uploadedFiles.map((file) => {
            const isImage = file.mimeType.startsWith("image/");
            return (
              <div key={file.id} className="uploaded-file-item">
                {isImage ? (
                  <Image
                    src={file.url || `data:${file.mimeType};base64,${file.base64Data}`}
                    alt={file.filename}
                    style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }}
                    preview={false}
                  />
                ) : (
                  <div className="file-icon-wrapper">
                    <FileOutlined style={{ fontSize: 20, color: '#666' }} />
                  </div>
                )}
                <Text className="file-name" ellipsis={{ tooltip: file.filename }}>
                  {file.filename}
                </Text>
                <button
                  className="remove-file-btn"
                  onClick={() => onRemoveFile(file.id)}
                  title="Remove file"
                >
                  <DeleteOutlined />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Main input container */}
      <div className="chat-input-container">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.docx,.xlsx,.txt,.md,.json"
          onChange={onFileSelect}
          style={{ display: "none" }}
        />

        {/* Textarea - grows vertically */}
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="How can I help you today?"
          disabled={isProcessing}
          rows={1}
        />

        {/* Button zone - protected area at bottom */}
        <div className="input-buttons-zone">
          {/* Plus button for file attachment */}
          <button
            className="input-action-btn plus-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            title="Attach file"
          >
            <PlusIcon />
          </button>

          {/* Send/Stop button */}
          {isProcessing ? (
            <button
              className="input-action-btn stop-btn"
              onClick={onStop}
              title="Stop"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              className={`input-action-btn send-btn ${canSend ? 'active' : ''}`}
              onClick={onSend}
              disabled={!canSend}
              title="Send message"
            >
              <ArrowUpIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
