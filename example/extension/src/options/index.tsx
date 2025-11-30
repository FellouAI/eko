import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  Form,
  Input,
  Button,
  message,
  Card,
  Select,
  AutoComplete,
  Tabs,
  Switch,
  Slider,
  InputNumber,
  Collapse,
  Typography,
  Tooltip,
  Space,
  Divider,
  Alert,
} from "antd";
import {
  SettingOutlined,
  RobotOutlined,
  CompassOutlined,
  CompressOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

const { Option } = Select;
const { Text, Title } = Typography;
const { Panel } = Collapse;

// Module types for different LLM use cases
type ModuleType = "planning" | "navigation" | "compression";

// Optimal presets for each module
const MODULE_PRESETS: Record<
  ModuleType,
  {
    name: string;
    description: string;
    icon: React.ReactNode;
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number;
    recommendedModels: string[];
  }
> = {
  planning: {
    name: "Planning",
    description:
      "Generates workflow plans and task breakdowns. Higher creativity for flexible planning.",
    icon: <CompassOutlined />,
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 8192,
    recommendedModels: [
      "claude-sonnet-4-5-20250929",
      "gpt-5.1",
      "claude-3-7-sonnet-20250219",
    ],
  },
  navigation: {
    name: "Navigation",
    description:
      "Controls browser actions and DOM interactions. Lower temperature for precise, deterministic actions.",
    icon: <RobotOutlined />,
    temperature: 0.2,
    topP: 0.8,
    topK: 20,
    maxOutputTokens: 16000,
    recommendedModels: [
      "claude-sonnet-4-5-20250929",
      "claude-sonnet-4-20250514",
      "gpt-4.1",
    ],
  },
  compression: {
    name: "Compression",
    description:
      "Summarizes context and compresses memory. Balanced settings for fast, accurate summarization.",
    icon: <CompressOutlined />,
    temperature: 0.5,
    topP: 0.85,
    topK: 30,
    maxOutputTokens: 4096,
    recommendedModels: ["gpt-4.1-mini", "claude-3-7-sonnet-20250219", "o4-mini"],
  },
};

// Module config interface
interface ModuleConfig {
  enabled: boolean;
  useDefaultModel: boolean;
  llm: string;
  modelName: string;
  apiKey: string;
  options: {
    baseURL: string;
  };
  parameters: {
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number;
  };
}

// Full config interface
interface FullLLMConfig {
  // Default/shared settings
  default: {
    llm: string;
    modelName: string;
    apiKey: string;
    options: {
      baseURL: string;
    };
  };
  // Module-specific settings
  modules: {
    planning: ModuleConfig;
    navigation: ModuleConfig;
    compression: ModuleConfig;
  };
}

const defaultModuleConfig = (module: ModuleType): ModuleConfig => ({
  enabled: true,
  useDefaultModel: true,
  llm: "anthropic",
  modelName: MODULE_PRESETS[module].recommendedModels[0],
  apiKey: "",
  options: {
    baseURL: "https://api.anthropic.com/v1",
  },
  parameters: {
    temperature: MODULE_PRESETS[module].temperature,
    topP: MODULE_PRESETS[module].topP,
    topK: MODULE_PRESETS[module].topK,
    maxOutputTokens: MODULE_PRESETS[module].maxOutputTokens,
  },
});

const defaultConfig: FullLLMConfig = {
  default: {
    llm: "anthropic",
    apiKey: "",
    modelName: "claude-sonnet-4-5-20250929",
    options: {
      baseURL: "https://api.anthropic.com/v1",
    },
  },
  modules: {
    planning: defaultModuleConfig("planning"),
    navigation: defaultModuleConfig("navigation"),
    compression: defaultModuleConfig("compression"),
  },
};

const OptionsPage = () => {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<FullLLMConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState("default");

  const modelLLMs = [
    { value: "anthropic", label: "Claude (default)" },
    { value: "openai", label: "OpenAI" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "openai-compatible", label: "OpenAI Compatible" },
    { value: "modelscope", label: "ModelScope" },
  ];

  const modelOptions: Record<string, { value: string; label: string }[]> = {
    anthropic: [
      {
        value: "claude-sonnet-4-5-20250929",
        label: "Claude Sonnet 4.5 (recommended)",
      },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
    ],
    openai: [
      { value: "gpt-5.1", label: "GPT-5.1 (recommended)" },
      { value: "gpt-5", label: "GPT-5" },
      { value: "gpt-5-mini", label: "GPT-5 Mini" },
      { value: "gpt-4.1", label: "GPT-4.1" },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini (fast)" },
      { value: "o4-mini", label: "O4 Mini" },
    ],
    openrouter: [
      {
        value: "anthropic/claude-sonnet-4.5",
        label: "Claude Sonnet 4.5 (recommended)",
      },
      { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { value: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
      { value: "google/gemini-3-pro", label: "Gemini 3 Pro" },
      { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "openai/gpt-5.1", label: "GPT-5.1" },
      { value: "openai/gpt-5", label: "GPT-5" },
      { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
      { value: "openai/gpt-4.1", label: "GPT-4.1" },
      { value: "openai/o4-mini", label: "O4 Mini" },
      { value: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { value: "x-ai/grok-4", label: "Grok 4" },
      { value: "x-ai/grok-4-fast", label: "Grok 4 Fast" },
    ],
    "openai-compatible": [
      { value: "doubao-seed-1-6-250615", label: "Doubao Seed" },
    ],
    modelscope: [
      { value: "Qwen/Qwen3-VL-8B-Instruct", label: "Qwen3-VL-8B" },
      { value: "Qwen/Qwen3-VL-30B-A3B-Instruct", label: "Qwen3-VL-30B" },
      { value: "Qwen/Qwen3-VL-235B-A22B-Instruct", label: "Qwen3-VL-235B" },
      { value: "Qwen/Qwen3-VL-8B-Thinking", label: "Qwen3-VL-8B Thinking" },
      { value: "Qwen/Qwen3-VL-30B-A3B-Thinking", label: "Qwen3-VL-30B Thinking" },
    ],
  };

  const baseURLMap: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    "openai-compatible": "https://openrouter.ai/api/v1",
    modelscope: "https://api-inference.modelscope.cn/v1",
  };

  useEffect(() => {
    chrome.storage.sync.get(["llmConfig", "llmConfigV2"], (result) => {
      // Try to load v2 config first
      if (result.llmConfigV2) {
        setConfig(result.llmConfigV2);
        form.setFieldsValue(result.llmConfigV2);
      } else if (result.llmConfig) {
        // Migrate from v1 config
        const v1Config = result.llmConfig;
        const migratedConfig: FullLLMConfig = {
          default: {
            llm: v1Config.llm || "anthropic",
            modelName: v1Config.modelName || "claude-sonnet-4-5-20250929",
            apiKey: v1Config.apiKey || "",
            options: {
              baseURL: v1Config.options?.baseURL || "https://api.anthropic.com/v1",
            },
          },
          modules: {
            planning: {
              ...defaultModuleConfig("planning"),
              useDefaultModel: true,
            },
            navigation: {
              ...defaultModuleConfig("navigation"),
              useDefaultModel: true,
            },
            compression: {
              ...defaultModuleConfig("compression"),
              useDefaultModel: true,
            },
          },
        };
        setConfig(migratedConfig);
        form.setFieldsValue(migratedConfig);
      }
    });
  }, []);

  const handleSave = () => {
    form
      .validateFields()
      .then((values) => {
        // Merge form values with current config
        const newConfig = { ...config, ...values };
        setConfig(newConfig);

        // Also save in v1 format for backward compatibility
        const v1Config = {
          llm: newConfig.default.llm,
          modelName: newConfig.default.modelName,
          apiKey: newConfig.default.apiKey,
          options: newConfig.default.options,
        };

        chrome.storage.sync.set(
          {
            llmConfig: v1Config,
            llmConfigV2: newConfig,
          },
          () => {
            message.success("Settings saved successfully!");
          }
        );
      })
      .catch(() => {
        message.error("Please check the form fields");
      });
  };

  const handleDefaultLLMChange = (value: string) => {
    const newDefault = {
      llm: value,
      apiKey: config.default.apiKey,
      modelName: modelOptions[value]?.[0]?.value || "",
      options: {
        baseURL: baseURLMap[value],
      },
    };
    const newConfig = { ...config, default: newDefault };
    setConfig(newConfig);
    form.setFieldsValue(newConfig);
  };

  const handleModuleLLMChange = (module: ModuleType, value: string) => {
    const newModuleConfig = {
      ...config.modules[module],
      llm: value,
      modelName: modelOptions[value]?.[0]?.value || "",
      options: {
        baseURL: baseURLMap[value],
      },
    };
    const newConfig = {
      ...config,
      modules: {
        ...config.modules,
        [module]: newModuleConfig,
      },
    };
    setConfig(newConfig);
    form.setFieldsValue(newConfig);
  };

  const handleResetModuleParams = (module: ModuleType) => {
    const preset = MODULE_PRESETS[module];
    const newModuleConfig = {
      ...config.modules[module],
      parameters: {
        temperature: preset.temperature,
        topP: preset.topP,
        topK: preset.topK,
        maxOutputTokens: preset.maxOutputTokens,
      },
    };
    const newConfig = {
      ...config,
      modules: {
        ...config.modules,
        [module]: newModuleConfig,
      },
    };
    setConfig(newConfig);
    form.setFieldsValue(newConfig);
    message.info(`Reset ${preset.name} parameters to optimal defaults`);
  };

  const renderDefaultSettings = () => (
    <Card
      title={
        <Space>
          <SettingOutlined />
          <span>Default Model Configuration</span>
        </Space>
      }
      className="shadow-md"
    >
      <Alert
        message="This is your primary LLM. Modules can use this model or have their own."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form.Item
        name={["default", "llm"]}
        label="LLM Provider"
        rules={[{ required: true, message: "Please select a provider" }]}
      >
        <Select
          placeholder="Choose a provider"
          onChange={handleDefaultLLMChange}
        >
          {modelLLMs.map((llm) => (
            <Option key={llm.value} value={llm.value}>
              {llm.label}
            </Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item
        name={["default", "options", "baseURL"]}
        label="Base URL"
        rules={[{ required: true, message: "Please enter the base URL" }]}
      >
        <Input placeholder="API base URL" />
      </Form.Item>

      <Form.Item
        name={["default", "modelName"]}
        label="Model"
        rules={[{ required: true, message: "Please select a model" }]}
      >
        <AutoComplete
          placeholder="Model name"
          options={modelOptions[config.default.llm] || []}
          filterOption={(input, option) =>
            (option?.value as string)
              ?.toUpperCase()
              .includes(input.toUpperCase())
          }
        />
      </Form.Item>

      <Form.Item
        name={["default", "apiKey"]}
        label="API Key"
        rules={[{ required: true, message: "Please enter the API Key" }]}
      >
        <Input.Password placeholder="Your API key" allowClear />
      </Form.Item>
    </Card>
  );

  const renderModuleSettings = (module: ModuleType) => {
    const preset = MODULE_PRESETS[module];
    const moduleConfig = config.modules[module];

    return (
      <Card
        title={
          <Space>
            {preset.icon}
            <span>{preset.name} Module</span>
          </Space>
        }
        className="shadow-md"
        extra={
          <Tooltip title="Reset to optimal defaults">
            <Button
              type="text"
              icon={<ThunderboltOutlined />}
              onClick={() => handleResetModuleParams(module)}
            >
              Reset Defaults
            </Button>
          </Tooltip>
        }
      >
        <Alert
          message={preset.description}
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          style={{ marginBottom: 16 }}
        />

        <Form.Item
          name={["modules", module, "useDefaultModel"]}
          label="Use Default Model"
          valuePropName="checked"
        >
          <Switch
            checkedChildren="Yes"
            unCheckedChildren="No"
            onChange={(checked) => {
              const newConfig = {
                ...config,
                modules: {
                  ...config.modules,
                  [module]: {
                    ...config.modules[module],
                    useDefaultModel: checked,
                  },
                },
              };
              setConfig(newConfig);
              form.setFieldsValue(newConfig);
            }}
          />
        </Form.Item>

        {!moduleConfig.useDefaultModel && (
          <>
            <Divider>Custom Model</Divider>

            <Form.Item
              name={["modules", module, "llm"]}
              label="LLM Provider"
            >
              <Select
                placeholder="Choose a provider"
                onChange={(v) => handleModuleLLMChange(module, v)}
              >
                {modelLLMs.map((llm) => (
                  <Option key={llm.value} value={llm.value}>
                    {llm.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name={["modules", module, "options", "baseURL"]}
              label="Base URL"
            >
              <Input placeholder="API base URL" />
            </Form.Item>

            <Form.Item
              name={["modules", module, "modelName"]}
              label="Model"
            >
              <AutoComplete
                placeholder="Model name"
                options={modelOptions[moduleConfig.llm] || []}
                filterOption={(input, option) =>
                  (option?.value as string)
                    ?.toUpperCase()
                    .includes(input.toUpperCase())
                }
              />
            </Form.Item>

            <Form.Item
              name={["modules", module, "apiKey"]}
              label="API Key (leave empty to use default)"
            >
              <Input.Password
                placeholder="Custom API key (optional)"
                allowClear
              />
            </Form.Item>
          </>
        )}

        <Divider>Generation Parameters</Divider>

        <Form.Item
          name={["modules", module, "parameters", "temperature"]}
          label={
            <Space>
              <span>Temperature</span>
              <Tooltip title="Controls randomness. Lower = more focused/deterministic, Higher = more creative/random">
                <InfoCircleOutlined />
              </Tooltip>
            </Space>
          }
        >
          <Slider
            min={0}
            max={1}
            step={0.05}
            marks={{
              0: "Precise",
              0.5: "Balanced",
              1: "Creative",
            }}
          />
        </Form.Item>

        <Form.Item
          name={["modules", module, "parameters", "topP"]}
          label={
            <Space>
              <span>Top P (Nucleus Sampling)</span>
              <Tooltip title="Controls diversity via nucleus sampling. Lower = more focused on likely tokens">
                <InfoCircleOutlined />
              </Tooltip>
            </Space>
          }
        >
          <Slider
            min={0.1}
            max={1}
            step={0.05}
            marks={{
              0.1: "Narrow",
              0.5: "Medium",
              1: "Wide",
            }}
          />
        </Form.Item>

        <Form.Item
          name={["modules", module, "parameters", "topK"]}
          label={
            <Space>
              <span>Top K</span>
              <Tooltip title="Limits vocabulary to top K tokens. Lower = more focused">
                <InfoCircleOutlined />
              </Tooltip>
            </Space>
          }
        >
          <InputNumber min={1} max={100} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          name={["modules", module, "parameters", "maxOutputTokens"]}
          label={
            <Space>
              <span>Max Output Tokens</span>
              <Tooltip title="Maximum length of generated response">
                <InfoCircleOutlined />
              </Tooltip>
            </Space>
          }
        >
          <InputNumber min={256} max={32000} step={256} style={{ width: "100%" }} />
        </Form.Item>

        <div
          style={{
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          <Text type="secondary">
            <strong>Recommended for {preset.name}:</strong>
            <br />
            Temperature: {preset.temperature} | Top P: {preset.topP} | Top K:{" "}
            {preset.topK}
            <br />
            Best models: {preset.recommendedModels.slice(0, 2).join(", ")}
          </Text>
        </div>
      </Card>
    );
  };

  const tabItems = [
    {
      key: "default",
      label: (
        <span>
          <SettingOutlined /> Default
        </span>
      ),
      children: renderDefaultSettings(),
    },
    {
      key: "planning",
      label: (
        <span>
          <CompassOutlined /> Planning
        </span>
      ),
      children: renderModuleSettings("planning"),
    },
    {
      key: "navigation",
      label: (
        <span>
          <RobotOutlined /> Navigation
        </span>
      ),
      children: renderModuleSettings("navigation"),
    },
    {
      key: "compression",
      label: (
        <span>
          <CompressOutlined /> Compression
        </span>
      ),
      children: renderModuleSettings("compression"),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        <SettingOutlined /> Browseless.ai LLM Settings
      </Title>

      <Form
        form={form}
        layout="vertical"
        initialValues={config}
        onValuesChange={(_, allValues) => {
          // Keep config in sync with form
          setConfig({ ...config, ...allValues });
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          type="card"
          style={{ marginBottom: 24 }}
        />

        <Form.Item>
          <Button
            type="primary"
            onClick={handleSave}
            block
            size="large"
            icon={<SettingOutlined />}
          >
            Save All Settings
          </Button>
        </Form.Item>
      </Form>

      <Collapse style={{ marginTop: 16 }}>
        <Panel header="Parameter Guide" key="1">
          <div style={{ fontSize: 13 }}>
            <p>
              <strong>Temperature:</strong> Controls randomness in generation.
            </p>
            <ul>
              <li>
                <strong>0.0-0.3:</strong> Very focused, deterministic. Best for
                precise actions like navigation.
              </li>
              <li>
                <strong>0.4-0.6:</strong> Balanced. Good for summarization and
                compression.
              </li>
              <li>
                <strong>0.7-1.0:</strong> More creative/varied. Good for
                planning and brainstorming.
              </li>
            </ul>

            <p>
              <strong>Top P (Nucleus Sampling):</strong> Cumulative probability
              threshold.
            </p>
            <ul>
              <li>
                <strong>0.1-0.5:</strong> Narrow focus, more predictable
                outputs.
              </li>
              <li>
                <strong>0.8-0.95:</strong> Wider vocabulary, more diverse
                outputs.
              </li>
            </ul>

            <p>
              <strong>Top K:</strong> Number of top tokens to consider.
            </p>
            <ul>
              <li>
                <strong>10-20:</strong> Very focused vocabulary.
              </li>
              <li>
                <strong>40-50:</strong> Balanced diversity.
              </li>
            </ul>
          </div>
        </Panel>
      </Collapse>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
