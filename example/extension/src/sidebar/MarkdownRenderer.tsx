import React from "react";
import "katex/dist/katex.min.css";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  secondary?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  secondary = false,
}) => {
  if (!content) {
    return null;
  }
  return (
    <div 
      className="markdown-body"
      style={{
        color: secondary ? 'rgba(0, 0, 0, 0.45)' : undefined,
        opacity: secondary ? 0.85 : 1,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
