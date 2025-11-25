import React from "react";
import {
  ToolOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import type { ChatContentItem } from "../types";
import { Card, Space, Typography, Tag, Collapse, Spin, Image } from "antd";

const { Text, Paragraph } = Typography;

interface ToolCallItemProps {
  item: ChatContentItem & { type: "tool" };
}

export const ToolCallItem: React.FC<ToolCallItemProps> = ({ item }) => {
  return (
    <Card
      size="small"
      style={{ marginTop: 8, backgroundColor: "#f5f5f5" }}
      title={
        <Space>
          <ToolOutlined />
          <Text strong>{item.toolName}</Text>
          {item.running && <Spin size="small" />}
          {item.result && (
            <Tag
              color={item.result.isError ? "red" : "green"}
              icon={
                item.result.isError ? (
                  <CloseCircleOutlined />
                ) : (
                  <CheckCircleOutlined />
                )
              }
            >
              {item.result.isError ? "失败" : "完成"}
            </Tag>
          )}
        </Space>
      }
    >
      {item.paramsText && !item.params && (
        <Text type="secondary" code>
          {item.paramsText}
          <span className="streaming-cursor">|</span>
        </Text>
      )}
      {item.params && (
        <Collapse
          size="small"
          defaultActiveKey={["params"]}
          items={[
            {
              key: "params",
              label: "参数",
              children: (
                <pre style={{ margin: 0, fontSize: 12 }}>
                  {JSON.stringify(item.params, null, 2)}
                </pre>
              ),
            },
          ]}
        />
      )}
      {item.running && item.runningText && (
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          {item.runningText}
          {!item.running && <span className="streaming-cursor">|</span>}
        </Paragraph>
      )}
      {item.result && (
        <Collapse
          size="small"
          style={{ marginTop: 8 }}
          defaultActiveKey={item.result.isError ? ["result"] : []}
          items={[
            {
              key: "result",
              label: (
                <Space>
                  <Text>结果</Text>
                  {item.result.isError && (
                    <Tag color="red" icon={<CloseCircleOutlined />}>
                      失败
                    </Tag>
                  )}
                </Space>
              ),
              children: (
                <div>
                  {item.result.content.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <Paragraph key={index} style={{ margin: 0 }}>
                          {part.text}
                        </Paragraph>
                      );
                    } else if (part.type === "image") {
                      return (
                        <Image
                          key={index}
                          src={`data:${part.mimeType || "image/png"};base64,${
                            part.data
                          }`}
                          alt="Tool result"
                          style={{ maxWidth: "100%", marginTop: 8 }}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
};
