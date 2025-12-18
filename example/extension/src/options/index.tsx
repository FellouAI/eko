import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Card, Select, AutoComplete } from "antd";

const { Option } = Select;

const OptionsPage = () => {
  const [form] = Form.useForm();

  const [config, setConfig] = useState({
    llm: "anthropic",
    apiKey: "",
    modelName: "claude-sonnet-4-5-20250929",
    options: {
      baseURL: "https://api.anthropic.com/v1",
    },
  });

  const [historyLLMConfig, setHistoryLLMConfig] = useState<Record<string, any>>(
    {}
  );

  useEffect(() => {
    chrome.storage.sync.get(["llmConfig", "historyLLMConfig"], (result) => {
      if (result.llmConfig) {
        if (result.llmConfig.llm === "") {
          result.llmConfig.llm = "anthropic";
        }
        setConfig(result.llmConfig);
        form.setFieldsValue(result.llmConfig);
      }
      if (result.historyLLMConfig) {
        setHistoryLLMConfig(result.historyLLMConfig);
      }
    });
  }, []);

  const handleSave = () => {
    form
      .validateFields()
      .then((value) => {
        setConfig(value);
        setHistoryLLMConfig({
          ...historyLLMConfig,
          [value.llm]: value,
        });
        chrome.storage.sync.set(
          {
            llmConfig: value,
            historyLLMConfig: {
              ...historyLLMConfig,
              [value.llm]: value,
            },
          },
          () => {
            message.success("Save Success!");
          }
        );
      })
      .catch(() => {
        message.error("Please check the form field");
      });
  };

  const modelLLMs = [
    { value: "anthropic", label: "Claude (default)" },
    { value: "openai", label: "OpenAI" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "google", label: "Google Generative" },
    { value: "bedrock", label: "AWS Bedrock" },
    { value: "azure", label: "Microsoft Azure" },
    { value: "openai-compatible", label: "OpenAI Compatible" },
    { value: "modelscope", label: "ModelScope" },
  ];

  const modelOptions = {
    anthropic: [
      {
        value: "claude-sonnet-4-5-20250929",
        label: "Claude Sonnet 4.5 (default)",
      },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
    ],
    openai: [
      { value: "gpt-5.2", label: "gpt-5.2 (default)" },
      { value: "gpt-5.1", label: "gpt-5.1" },
      { value: "gpt-5", label: "gpt-5" },
      { value: "gpt-5-mini", label: "gpt-5-mini" },
      { value: "gpt-4.1", label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "o4-mini", label: "o4-mini" },
    ],
    openrouter: [
      {
        value: "anthropic/claude-sonnet-4.5",
        label: "claude-sonnet-4.5 (default)",
      },
      { value: "anthropic/claude-sonnet-4", label: "claude-sonnet-4" },
      { value: "anthropic/claude-3.7-sonnet", label: "claude-3.7-sonnet" },
      { value: "google/gemini-3-pro-preview", label: "gemini-3-pro-preview" },
      {
        value: "google/gemini-3-flash-preview",
        label: "gemini-3-flash-preview",
      },
      { value: "google/gemini-3-pro", label: "gemini-3-pro" },
      { value: "google/gemini-2.5-pro", label: "gemini-2.5-pro" },
      { value: "openai/gpt-5.2", label: "gpt-5.2" },
      { value: "openai/gpt-5.1", label: "gpt-5.1" },
      { value: "openai/gpt-5", label: "gpt-5" },
      { value: "openai/gpt-5-mini", label: "gpt-5-mini" },
      { value: "openai/gpt-4.1", label: "gpt-4.1" },
      { value: "openai/o4-mini", label: "o4-mini" },
      { value: "openai/gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "x-ai/grok-4", label: "grok-4" },
      { value: "x-ai/grok-4-fast", label: "grok-4-fast" },
    ],
    google: [
      {
        value: "gemini-3-pro-preview",
        label: "gemini-3-pro-preview (default)",
      },
      { value: "gemini-3-flash-preview", label: "gemini-3-flash-preview" },
      { value: "gemini-3-pro", label: "gemini-3-pro" },
      { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { value: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    ],
    bedrock: [
      {
        value: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        label: "claude-sonnet-4-5 (default)",
      },
      {
        value: "us.anthropic.claude-opus-4-1-20250805-v1:0",
        label: "claude-opus-4-1",
      },
      {
        value: "us.anthropic.claude-sonnet-4-20250514-v1:0",
        label: "claude-sonnet-4",
      },
    ],
    azure: [
      { value: "gpt-5.2", label: "gpt-5.2 (default)" },
      { value: "gpt-5.1", label: "gpt-5.1" },
      { value: "gpt-5", label: "gpt-5" },
      { value: "gpt-4.1", label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
    ],
    "openai-compatible": [{ value: "", label: "Please enter the model" }],
    modelscope: [
      {
        value: "Qwen/Qwen3-VL-30B-A3B-Instruct",
        label: "Qwen3-VL-30B-A3B-Instruct (default)",
      },
      {
        value: "Qwen/Qwen3-VL-30B-A3B-Thinking",
        label: "Qwen3-VL-30B-A3B-Thinking",
      },
      {
        value: "Qwen/Qwen3-VL-235B-A22B-Instruct",
        label: "Qwen3-VL-235B-A22B-Instruct",
      },
      {
        value: "Qwen/Qwen3-VL-8B-Instruct",
        label: "Qwen3-VL-8B-Instruct",
      },
    ],
  };

  const handleLLMChange = (value: string) => {
    const baseURLMap = {
      openai: "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com/v1",
      openrouter: "https://openrouter.ai/api/v1",
      modelscope: "https://api-inference.modelscope.cn/v1",
      // https://{resourceName}.cognitiveservices.azure.com/openai
      azure: "https://{resourceName}.openai.azure.com/openai",
      "openai-compatible": "https://openrouter.ai/api/v1",
      google: "",
      bedrock: "",
    };
    const newConfig = historyLLMConfig[value] || {
      llm: value,
      apiKey: "",
      modelName: modelOptions[value][0].value,
      options: {
        baseURL: baseURLMap[value],
      },
    };
    setConfig(newConfig);
    form.setFieldsValue(newConfig);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card title="Model Config" className="shadow-md">
        <Form form={form} layout="vertical" initialValues={config}>
          <Form.Item
            name="llm"
            label="LLM"
            rules={[
              {
                required: true,
                message: "Please select a LLM",
              },
            ]}
          >
            <Select placeholder="Choose a LLM" onChange={handleLLMChange}>
              {modelLLMs.map((llm) => (
                <Option key={llm.value} value={llm.value}>
                  {llm.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="modelName"
            label="Model Name"
            rules={[
              {
                required: true,
                message: "Please select a model",
              },
            ]}
          >
            <AutoComplete
              placeholder="Model name"
              options={modelOptions[config.llm]}
              filterOption={(inputValue, option) =>
                (option.value as string)
                  .toUpperCase()
                  .indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[
              {
                required: true,
                message: "Please enter the API Key",
              },
            ]}
          >
            <Input.Password placeholder="Please enter the API Key" allowClear />
          </Form.Item>

          <Form.Item name={["options", "baseURL"]} label="Base URL">
            <Input placeholder="Please enter the base URL (Optional)" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" onClick={handleSave} block>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
