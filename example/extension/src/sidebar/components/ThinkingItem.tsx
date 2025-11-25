import React from "react";
import { Collapse, Space, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

const { Text, Paragraph } = Typography;

interface ThinkingItemProps {
  streamId: string;
  text: string;
  streamDone: boolean;
}

export const ThinkingItem: React.FC<ThinkingItemProps> = ({
  text,
  streamDone,
}) => {
  return (
    <Collapse
      size="small"
      style={{ marginBottom: 8 }}
      defaultActiveKey={streamDone ? [] : ["thinking"]}
      items={[
        {
          key: "thinking",
          label: (
            <Space>
              <LoadingOutlined />
              <Text type="secondary">Thinking...</Text>
            </Space>
          ),
          children: (
            <Paragraph
              style={{ margin: 0, whiteSpace: "pre-wrap" }}
              type="secondary"
            >
              {text}
              {!streamDone && <span className="streaming-cursor">|</span>}
            </Paragraph>
          ),
        },
      ]}
    />
  );
};
