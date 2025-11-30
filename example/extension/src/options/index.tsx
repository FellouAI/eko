import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Card, Typography, Space } from "antd";
import { SettingOutlined, CheckCircleOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

const OptionsPage = () => {
  const [form] = Form.useForm();
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(["openRouterApiKey"], (result) => {
      if (result.openRouterApiKey) {
        setHasKey(true);
        // Show masked version
        form.setFieldsValue({
          apiKey: "••••••••••••••••" + result.openRouterApiKey.slice(-4),
        });
      }
    });
  }, []);

  const handleSave = () => {
    form.validateFields().then((values) => {
      const apiKey = values.apiKey;

      // Don't save if it's the masked version
      if (apiKey.startsWith("••••")) {
        message.info("API key unchanged");
        return;
      }

      chrome.storage.sync.set({ openRouterApiKey: apiKey }, () => {
        setSaved(true);
        setHasKey(true);
        // Show masked version after save
        form.setFieldsValue({
          apiKey: "••••••••••••••••" + apiKey.slice(-4),
        });
        message.success("API key saved successfully!");
        setTimeout(() => setSaved(false), 3000);
      });
    });
  };

  const handleClear = () => {
    form.setFieldsValue({ apiKey: "" });
    setHasKey(false);
  };

  return (
    <div style={{ padding: 32, maxWidth: 500, margin: "0 auto" }}>
      <Title level={3} style={{ marginBottom: 8, textAlign: "center" }}>
        <SettingOutlined /> Browseless.ai
      </Title>

      <Paragraph style={{ textAlign: "center", color: "#666", marginBottom: 32 }}>
        Powered by OpenRouter Auto-Routing
      </Paragraph>

      <Card className="shadow-md">
        <Form form={form} layout="vertical">
          <Form.Item
            name="apiKey"
            label={
              <Space>
                <Text strong>OpenRouter API Key</Text>
                {hasKey && <CheckCircleOutlined style={{ color: "#52c41a" }} />}
              </Space>
            }
            rules={[{ required: true, message: "Please enter your OpenRouter API key" }]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Get your API key at{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                  openrouter.ai/keys
                </a>
              </Text>
            }
          >
            <Input.Password
              placeholder="sk-or-..."
              size="large"
              onFocus={handleClear}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              onClick={handleSave}
              block
              size="large"
              icon={saved ? <CheckCircleOutlined /> : <SettingOutlined />}
            >
              {saved ? "Saved!" : "Save API Key"}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <div style={{ marginTop: 24, padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          <strong>How it works:</strong>
          <br /><br />
          Browseless.ai uses OpenRouter's intelligent auto-routing to automatically
          select the best AI model for each task. The system analyzes your prompts
          and routes them to the optimal model, delivering 8-10% better performance
          than manually selecting models.
          <br /><br />
          <strong>Modules:</strong>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li><strong>Planning</strong> — Higher creativity for flexible task planning</li>
            <li><strong>Navigation</strong> — Precise, deterministic browser control</li>
            <li><strong>Compression</strong> — Fast, accurate context summarization</li>
          </ul>
        </Text>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
