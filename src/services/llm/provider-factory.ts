import {
  LLMConfig,
  LLMProvider,
  ClaudeConfig,
  OpenaiConfig,
} from "../../types";
import { ClaudeProvider } from './claude-provider';
import { OpenaiProvider } from './openai-provider';

export class LLMProviderFactory {
  public static buildLLMProvider(config: LLMConfig) {
    let llmProvider: LLMProvider;
    if (typeof config == 'string') {
      llmProvider = new ClaudeProvider(config);
    } else if ('llm' in config) {
      if (config.llm == 'claude') {
        let claudeConfig = config as ClaudeConfig;
        llmProvider = new ClaudeProvider(
          claudeConfig.apiKey,
          claudeConfig.modelName,
          claudeConfig.options
        );
      } else if (config.llm == 'openai') {
        let openaiConfig = config as OpenaiConfig;
        llmProvider = new OpenaiProvider(
          openaiConfig.apiKey,
          openaiConfig.modelName,
          openaiConfig.options
        );
      } else {
        throw new Error('Unknown parameter: llm > ' + config['llm']);
      }
    } else {
      llmProvider = config as LLMProvider;
    }
    return llmProvider;
  }
}
