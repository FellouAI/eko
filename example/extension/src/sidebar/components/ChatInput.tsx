import React, { useRef } from "react";
import {
  SendOutlined,
  StopOutlined,
  FileOutlined,
  DeleteOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import type { UploadedFile } from "../types";
import { Button, Space, Image, Typography } from "antd";
import { WebpageMentionInput } from "./WebpageMentionInput";

const { Text } = Typography;

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

  return (
    <div
      style={{
        padding: "16px",
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e8e8e8",
      }}
    >
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
                      src={
                        file.url
                          ? file.url
                          : `data:${file.mimeType};base64,${file.base64Data}`
                      }
                      alt={file.filename}
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: "cover",
                        borderRadius: 4,
                        marginRight: 8,
                      }}
                      preview={false}
                    />
                  ) : (
                    <FileOutlined style={{ marginRight: 8, fontSize: 16 }} />
                  )}
                  <Text
                    style={{
                      fontSize: 12,
                      marginRight: 8,
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.filename}
                  </Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => onRemoveFile(file.id)}
                    style={{ padding: 0, width: 20, height: 20 }}
                  />
                </div>
              );
            })}
          </Space>
        </div>
      )}

      <Space.Compact style={{ width: "100%", alignItems: "center" }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.docx,.xlsx,.txt,.md,.json"
          onChange={onFileSelect}
          style={{ display: "none" }}
        />
        <Button
          icon={<PaperClipOutlined />}
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || currentMessageId !== null}
        />

        <WebpageMentionInput
          value={inputValue}
          onChange={onInputChange}
          disabled={sending || currentMessageId !== null}
          onSend={onSend}
        />

        {currentMessageId ? (
          <Button danger icon={<StopOutlined />} onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSend}
            loading={sending}
            disabled={
              (!inputValue.trim() && uploadedFiles.length === 0) || sending
            }
            style={{ padding: "0 10px" }}
          >
            Send
          </Button>
        )}
      </Space.Compact>
    </div>
  );
};
