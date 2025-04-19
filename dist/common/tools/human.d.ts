import { HumanInputTextInput, HumanInputTextResult, HumanInputSingleChoiceInput, HumanInputSingleChoiceResult, HumanInputMultipleChoiceInput, HumanInputMultipleChoiceResult, HumanOperateInput, HumanOperateResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
export declare class HumanInputText implements Tool<HumanInputTextInput, HumanInputTextResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: HumanInputTextInput): Promise<HumanInputTextResult>;
}
export declare class HumanInputSingleChoice implements Tool<HumanInputSingleChoiceInput, HumanInputSingleChoiceResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: HumanInputSingleChoiceInput): Promise<HumanInputSingleChoiceResult>;
}
export declare class HumanInputMultipleChoice implements Tool<HumanInputMultipleChoiceInput, HumanInputMultipleChoiceResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: HumanInputMultipleChoiceInput): Promise<HumanInputMultipleChoiceResult>;
}
export declare class HumanOperate implements Tool<HumanOperateInput, HumanOperateResult> {
    name: string;
    description: string;
    input_schema: InputSchema;
    constructor();
    execute(context: ExecutionContext, params: HumanOperateInput): Promise<HumanOperateResult>;
}
