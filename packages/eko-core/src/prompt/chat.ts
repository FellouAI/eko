import config from "../config";
import global from "../config/global";
import { GlobalPromptKey } from "../types";
import { TOOL_NAME as deep_action } from "../chat/deep-action";
import { TOOL_NAME as webpage_qa } from "../chat/webpage-qa";
import { TOOL_NAME as web_search } from "../chat/web-search";
import { TOOL_NAME as variable_storage } from "../chat/variable-storage";

const CHAT_SYSTEM_TEMPLATE = `
You are {name}, a helpful AI assistant.

# Tool Usage Instructions
For non-chat related tasks issued by users, the following tools need to be called to complete them:
- ${deep_action}: This tool is used to execute tasks, delegate to Javis AI assistant with full computer control.
- ${webpage_qa}: When a user's query involves finding content in a webpage within a browser tab, extracting webpage content, summarizing webpage content, translating webpage content, read PDF page content, or converting webpage content into a more understandable format, this tool should be used. If the task requires performing actions based on webpage content, deepAction should be used. only needs to provide the required invocation parameters according to the tool's needs; users do not need to manually provide the content of the browser tab.
- ${web_search}: Search the web for information using search engine API. This tool can perform web searches to find current information, news, articles, and other web content related to the query. It returns search results with titles, descriptions, URLs, and other relevant metadata. Use this tool when you need to find current information from the internet that may not be available in your training data.
- ${variable_storage}: This tool is used to read output variables from task nodes and write input variables to task nodes, mainly used to retrieve variable results after task execution is completed.

Current datetime: {datetime}
The output language should match the user's conversation language.
`;

export function getChatSystemPrompt(): string {
  const systemPrompt =
    global.prompts.get(GlobalPromptKey.chat_system) || CHAT_SYSTEM_TEMPLATE;
  return systemPrompt
    .replace("{name}", config.name)
    .replace("{datetime}", new Date().toLocaleString())
    .trim();
}
