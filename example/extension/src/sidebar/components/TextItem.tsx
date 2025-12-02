import React from "react";
import { Spin } from "antd";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface TextItemProps {
  streamId: string;
  text: string;
  streamDone: boolean;
}

export const TextItem: React.FC<TextItemProps> = ({ text, streamDone }) => {
  return (
    <div style={{ marginBottom: 8 }}>
      <MarkdownRenderer content={text} />
      {!streamDone && <Spin size="small" style={{ color: "white" }} />}
    </div>
  );
};
