import {
  HumanInputTextInput,
  HumanInputTextResult,
  HumanInputSingleChoiceInput,
  HumanInputSingleChoiceResult,
  HumanInputMultipleChoiceInput,
  HumanInputMultipleChoiceResult,
  HumanOperateInput,
  HumanOperateResult,
} from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';

export class HumanInputText implements Tool<HumanInputTextInput, HumanInputTextResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_input_text';
    this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field. The user will provide you with a text as an answer.';
    this.input_schema = {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Ask the user here.',
        },
      },
      required: ['question'],
    };
  }

  async execute(context: ExecutionContext, params: HumanInputTextInput): Promise<HumanInputTextResult> {
    if (typeof params !== 'object' || params === null || !params.question) {
      throw new Error('Invalid parameters. Expected an object with a "question" property.');
    }
    const question = params.question;
    console.log("question: " + question);
    let onHumanInputText = context.callback?.hooks.onHumanInputText;
    if (onHumanInputText) {
      let answer;
      try {
        answer = await onHumanInputText(question);
      } catch (e) {
        console.error(e);
        return {status: "Error: Cannot get user's answer.", answer: ""};
      }
      console.log("answer: " + answer);
      return {status: "OK", answer: answer};
    } else {
      console.error("`onHumanInputText` not implemented");
      return {status: "Error: Cannot get user's answer.", answer: ""};
    }
  }
}

export class HumanInputSingleChoice implements Tool<HumanInputSingleChoiceInput, HumanInputSingleChoiceResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_input_single_choice';
    this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE choice as an answer.';
    this.input_schema = {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Ask the user here.',
        },
        choices: {
          type: 'array',
          description: 'All of the choices.',
        }
      },
      required: ['question', 'choices'],
    };
  }

  async execute(context: ExecutionContext, params: HumanInputSingleChoiceInput): Promise<HumanInputSingleChoiceResult> {
    if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
      throw new Error('Invalid parameters. Expected an object with a "question" and "choices" property.');
    }
    const question = params.question;
    const choices = params.choices;
    console.log("question: " + question);
    console.log("choices: " + choices);
    let onHumanInputSingleChoice = context.callback?.hooks.onHumanInputSingleChoice;
    if (onHumanInputSingleChoice) {
      let answer;
      try {
        answer = await onHumanInputSingleChoice(question, choices);
      } catch (e) {
        console.error(e);
        return {status: "Error: Cannot get user's answer.", answer: ""};
      }
      console.log("answer: " + answer);
      return {status: "OK", answer: answer};
    } else {
      console.error("`onHumanInputSingleChoice` not implemented");
      return {status: "Error: Cannot get user's answer.", answer: ""};
    }
  }
}

export class HumanInputMultipleChoice implements Tool<HumanInputMultipleChoiceInput, HumanInputMultipleChoiceResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_input_multiple_choice';
    this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE or MORE choice as an answer.';
    this.input_schema = {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Ask the user here.',
        },
        choices: {
          type: 'array',
          description: 'All of the choices.',
        }
      },
      required: ['question', 'choices'],
    };
  }

  async execute(context: ExecutionContext, params: HumanInputMultipleChoiceInput): Promise<HumanInputMultipleChoiceResult> {
    if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
      throw new Error('Invalid parameters. Expected an object with a "question" and "choices" property.');
    }
    const question = params.question;
    const choices = params.choices;
    console.log("question: " + question);
    console.log("choices: " + choices);
    let onHumanInputMultipleChoice = context.callback?.hooks.onHumanInputMultipleChoice;
    if (onHumanInputMultipleChoice) {
      let answer;
      try {
        answer = await onHumanInputMultipleChoice(question, choices)
      } catch (e) {
        console.error(e);
        return {status: "`onHumanInputMultipleChoice` not implemented", answer: []};
      }
      console.log("answer: " + answer);
      return {status: "OK", answer: answer};
    } else {
      console.error("Cannot get user's answer.");
      return {status: "Error: Cannot get user's answer.", answer: []};
    }
  }
}

export class HumanOperate implements Tool<HumanOperateInput, HumanOperateResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_operate';
    this.description = 'When you encounter operations that require login, CAPTCHA verification, or other tasks that you cannot complete, please call this tool, transfer control to the user, and explain why.';
    this.input_schema = {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'The reason why you need to transfer control.',
        },
      },
      required: ['reason'],
    };
  }

  async execute(context: ExecutionContext, params: HumanOperateInput): Promise<HumanOperateResult> {
    if (typeof params !== 'object' || params === null || !params.reason) {
      throw new Error('Invalid parameters. Expected an object with a "reason" property.');
    }
    const reason = params.reason;
    console.log("reason: " + reason);
    let onHumanOperate = context.callback?.hooks.onHumanOperate;
    if (onHumanOperate) {
      let userOperation;
      try {
        userOperation = await onHumanOperate(reason);
      } catch (e) {
        console.error(e);
        return {status: "`onHumanOperate` not implemented", userOperation: ""};
      }
      console.log("userOperation: " + userOperation);
      return {status: "OK", userOperation: userOperation};
    } else {
      console.error("Cannot get user's operation.");
      return {status: "Error: Cannot get user's operation.", userOperation: ""};
    }
  }
}
