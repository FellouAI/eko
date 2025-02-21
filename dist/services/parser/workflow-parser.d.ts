import { Workflow } from '../../types/workflow.types';
import { ValidationResult } from '../../types/parser.types';
import { EkoConfig } from '@/types';
export declare class WorkflowParser {
    /**
     * Parse JSON string into runtime Workflow object
     * @throws {Error} if JSON is invalid or schema validation fails
     */
    static parse(json: string, ekoConfig: EkoConfig): Workflow;
    /**
     * Convert runtime Workflow object to JSON string
     */
    static serialize(workflow: Workflow): string;
    /**
     * Validate workflow JSON structure against schema
     */
    static validate(json: unknown): ValidationResult;
    private static toRuntime;
    /**
     * Convert runtime Workflow object to JSON structure
     */
    private static fromRuntime;
}
