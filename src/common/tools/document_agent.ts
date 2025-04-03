import { TOOL_PROMPTS } from '@/prompts';
import {
  LLMParameters,
  Tool,
  InputSchema,
  ExecutionContext,
  DocumentAgentToolInput,
  DocumentAgentToolOutput,
  Message,
} from '@/types';

export class DocumentAgentTool implements Tool<DocumentAgentToolInput, DocumentAgentToolOutput> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'document_agent';
    this.description = TOOL_PROMPTS.document_agent.description;
    this.input_schema = TOOL_PROMPTS.document_agent.input_schema;
  }

  async execute(context: ExecutionContext, params: DocumentAgentToolInput): Promise<DocumentAgentToolOutput> {
    params.references = context.variables;
    const messages: Message[] = [
      {
        role: 'system',
        content: 'You are an excellent writer, skilled at composing various types of copywriting and texts in different styles. You can draft documents based on the title, background, or reference materials provided by clients. Now, the client will provide you with a lot of information, including the type of copywriting, title, background, key points, style, and reference materials. Please write a document in Markdown format.',
      },
      {
        role: 'user',
        content: JSON.stringify(params),
      },
    ];
    const llmParams: LLMParameters = { maxTokens: 8192 };
    const response = await context.llmProvider.generateText(messages, llmParams);
    const content = typeof response.content == 'string' ? response.content : (response.content as any[])[0].text;
    context.variables.set("workflow_transcript", content);
    return { status: "OK", content };
  }
}
