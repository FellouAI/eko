import { SummaryWorkflowInput } from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';

export class SummaryWorkflow implements Tool<SummaryWorkflowInput, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'summary_workflow';
    //description的修改
    this.description = 'Summarize briefly what this workflow has accomplished. If there is a large text to follow, separate the summary and the large text with "--".';
    this.input_schema = {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Your summary in markdown format. If there is a large text, include it after "--".',
        },
      },
      required: ['summary'],
    };
  }

  async execute(context: ExecutionContext, params: SummaryWorkflowInput): Promise<any> {
    if (typeof params!== 'object' || params === null ||!params.summary) {
      // 添加日志输出，查看 params 的具体值
      console.log('Received params:', params);
      throw new Error('Invalid parameters. Expected an object with a "summary" property.');
    }
    //const summary = params.summary;
    let summary = params.summary;
    // 假设我们可以通过某种方式判断是否有大段文本，这里简单判断是否包含 --
    if (!summary.includes('--')) {
      // 没有大段文本，保持原样
    } else {
      // 有大段文本，不做额外处理，因为已经包含 --
    }
    console.log("summary: " + summary);

    //将summary存储到result变量中
    context.variables.set('result',summary);

    //删掉钩子
    //await context.callback?.hooks.onSummaryWorkflow?.(summary);
    return {status: "OK"};
  }
}
