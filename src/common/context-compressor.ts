import { LLMParameters, LLMProvider, Message, ToolCall } from '@/types';
import { logger } from './log';

export abstract class ContextCompressor {
  public abstract compress(messages: Message[]): Promise<Message[]>;
}

export class NoCompress extends ContextCompressor {
  public async compress(messages: Message[]): Promise<Message[]> {
    logger.debug('ContextCompressor = NoCompress');
    let compressed = JSON.parse(JSON.stringify(messages));
    logger.debug('compressed:', compressed);
    return Promise.resolve(compressed);
  }
}

export class SimpleQACompress extends ContextCompressor {
  public async compress(messages: Message[]): Promise<Message[]> {
    logger.debug('ContextCompressor = SimpleQACompress');
    messages = JSON.parse(JSON.stringify(messages));
    let compressed: Message[] = [];
    const compress = (msg: Message, idx: number) => {
      if (msg.role == 'system') {
        return msg;
      } else if (msg.role == 'assistant') {
        if (idx == messages.length - 2) {
          return msg;
        } else if (typeof msg.content == 'string') {
          const nextMessage = messages[idx + 1];
          if (nextMessage.role == 'assistant' && Array.isArray(nextMessage.content)) {
            return null;
          } else {
            return msg;
          }
        } else {
          const task = (msg.content[0] as ToolCall).input.userSidePrompt;
          const details = (msg.content[0] as ToolCall).input.thinking;
          return {
            role: 'assistant',
            content: `<task>${task}</task><details>${details}</details>`,
          } as Message;
        }
      } else if (msg.role == 'user' || typeof msg.content == 'string') {
        if (idx == messages.length - 1 || idx == 1) {
          return msg;
        } else {
          let aiResponseMsg = messages[idx + 1];
          if (typeof aiResponseMsg.content == 'string') {
            aiResponseMsg = messages[idx + 2];
          }
          const result = (aiResponseMsg.content[0] as ToolCall).input.observation;
          return {
            role: 'user',
            content: `<result>${result}</result>`,
          } as Message;
        }
      } else {
        logger.warn('unknown message type, return null');
        return null;
      }
    };
    messages.forEach((msg, idx) => {
      logger.debug({ idx, msg });
      const compressedMsg = compress(msg, idx);
      logger.debug(compressedMsg);
      if (compressedMsg) {
        compressed.push(compressedMsg);
      } else {
      }
    });
    return Promise.resolve(compressed);
  }
}

export class SummaryCompress extends ContextCompressor {
  private llmProvider: LLMProvider;
  private SystemMessage: Message;
  private HistoryMessage: Message;

  constructor(
    llmProvider: LLMProvider,
    private params_copy: LLMParameters
  ) {
    super();
    this.llmProvider = llmProvider;
    this.SystemMessage = {
      role: 'system',
      content: `You are a memory summarization system that records and preserves the complete interaction history between a human and an AI agent. You are provided with the agent’s execution history over the past N steps. Your task is to produce a comprehensive summary of the agent's output history that contains every detail necessary for the agent to continue the task without ambiguity. **Every output produced by the agent must be recorded verbatim as part of the summary.**

### Overall Structure:
- **Overview (Global Metadata):**
  - **Task Objective**: The overall goal the agent is working to accomplish.
  - **Progress Status**: The current completion percentage and summary of specific milestones or steps completed.

- **Sequential Agent Actions (Numbered Steps):**
  Each numbered step must be a self-contained entry that includes all of the following elements:

  1. **Agent Action**:
     - Precisely describe what the agent did (e.g., "Clicked on the 'Blog' link", "Called API to fetch content", "Scraped page data").
     - Include all parameters, target elements, or methods involved.

  2. **Action Result (Mandatory, Unmodified)**:
     - Immediately follow the agent action with its exact, unaltered output.
     - Record all returned data, responses, HTML snippets, JSON content, or error messages exactly as received. This is critical for constructing the final output later.

  3. **Embedded Metadata**:
     For the same numbered step, include additional context such as:
     - **Key Findings**: Any important information discovered (e.g., URLs, data points, search results).
     - **Navigation History**: For browser agents, detail which pages were visited, including their URLs and relevance.
     - **Errors & Challenges**: Document any error messages, exceptions, or challenges encountered along with any attempted recovery or troubleshooting.
     - **Current Context**: Describe the state after the action (e.g., "Agent is on the blog detail page" or "JSON data stored for further processing") and what the agent plans to do next.

### Guidelines:
1. **Preserve Every Output**: The exact output of each agent action is essential. Do not paraphrase or summarize the output. It must be stored as is for later use.
2. **Chronological Order**: Number the agent actions sequentially in the order they occurred. Each numbered step is a complete record of that action.
3. **Detail and Precision**:
   - Use exact data: Include URLs, element indexes, error messages, JSON responses, and any other concrete values.
   - Preserve numeric counts and metrics (e.g., "3 out of 5 items processed").
   - For any errors, include the full error message and, if applicable, the stack trace or cause.
4. **If you find the history summary in messages, you should repeat it first.
5. **Output Only the Summary**: The final output must consist solely of the structured summary with no additional commentary or preamble.

### Example Template:

\`\`\`
## Summary of the agent's execution history

**Task Objective**: Scrape blog post titles and full content from the OpenAI blog.
**Progress Status**: 10% complete — 5 out of 50 blog posts processed.

1. **Agent Action**: Opened URL "https://openai.com"  
   **Action Result**:  
      "HTML Content of the homepage including navigation bar with links: 'Blog', 'API', 'ChatGPT', etc."  
   **Key Findings**: Navigation bar loaded correctly.  
   **Navigation History**: Visited homepage: "https://openai.com"  
   **Current Context**: Homepage loaded; ready to click on the 'Blog' link.

2. **Agent Action**: Clicked on the "Blog" link in the navigation bar.  
   **Action Result**:  
      "Navigated to 'https://openai.com/blog/' with the blog listing fully rendered."  
   **Key Findings**: Blog listing shows 10 blog previews.  
   **Navigation History**: Transitioned from homepage to blog listing page.  
   **Current Context**: Blog listing page displayed.

3. **Agent Action**: Extracted the first 5 blog post links from the blog listing page.  
   **Action Result**:  
      "[ '/blog/chatgpt-updates', '/blog/ai-and-education', '/blog/openai-api-announcement', '/blog/gpt-4-release', '/blog/safety-and-alignment' ]"  
   **Key Findings**: Identified 5 valid blog post URLs.  
   **Current Context**: URLs stored in memory for further processing.

4. **Agent Action**: Visited URL "https://openai.com/blog/chatgpt-updates"  
   **Action Result**:  
      "HTML content loaded for the blog post including full article text."  
   **Key Findings**: Extracted blog title "ChatGPT Updates – March 2025" and article content excerpt.  
   **Current Context**: Blog post content extracted and stored.

5. **Agent Action**: Extracted blog title and full article content from "https://openai.com/blog/chatgpt-updates"  
   **Action Result**:  
      "{ 'title': 'ChatGPT Updates – March 2025', 'content': 'We\\'re introducing new updates to ChatGPT, including improved browsing capabilities and memory recall... (full content)' }"  
   **Key Findings**: Full content captured for later summarization.  
   **Current Context**: Data stored; ready to proceed to next blog post.

... (Additional numbered steps for subsequent actions)
`,
    };

    this.HistoryMessage = {
      role: 'user',
      content: '[Task history memory ends]',
    };
  }

  public async compress(messages: Message[]): Promise<Message[]> {
    logger.debug('ContextCompressor = SummaryCompressor');
    messages = JSON.parse(JSON.stringify(messages));
    if (messages.length <= 10) {
      return messages;
    } else {
      let compressMessages: Message[] = [];
      // system message: You are an AI agent...
      compressMessages.push(messages[0]);
      // user message: Your ultimate task is...
      compressMessages.push(messages[1]);

      let inputMessages = messages.slice(2, -2);
      inputMessages.unshift({ role: 'user', content: '[Task history memory begins]' });
      inputMessages.unshift(this.SystemMessage);

      const result = await this.llmProvider.generateText(inputMessages, this.params_copy);
      compressMessages.push({
          role: 'assistant',
          content: result.content,
      });

      compressMessages.push(this.HistoryMessage);
      // push last 2 messages for tool_call and tool_call_result pair
      compressMessages.push(...messages.slice(-2));
      return compressMessages;
    }
  }
}
