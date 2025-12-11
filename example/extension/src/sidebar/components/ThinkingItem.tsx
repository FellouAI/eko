import React, { useState, useEffect } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { Collapse, Space, Spin, Typography } from "antd";

const { Text } = Typography;

interface ThinkingItemProps {
  streamId: string;
  text: string;
  streamDone: boolean;
}

export const ThinkingItem: React.FC<ThinkingItemProps> = ({
  text,
  streamDone,
}) => {
  const [activeKey, setActiveKey] = useState<string[]>(
    streamDone ? [] : ["thinking"]
  );

  useEffect(() => {
    if (streamDone) {
      setActiveKey([]);
    }
  }, [streamDone]);

  return (
    <Collapse
      size="small"
      style={{ marginBottom: 8 }}
      activeKey={activeKey}
      onChange={(keys) => setActiveKey(keys as string[])}
      items={[
        {
          key: "thinking",
          label: (
            <Space>
              {!streamDone && <LoadingOutlined />}
              <Text type="secondary">Thinking</Text>
            </Space>
          ),
          children: (
            <div>
              <MarkdownRenderer content={text} secondary />
              {!streamDone && <Spin size="small" style={{ color: "white" }} />}
            </div>
          ),
        },
      ]}
    />
  );
};
