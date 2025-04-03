export interface ValidationError {
    type: "schema" | "reference" | "type" | "tool";
    message: string;
    path?: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}
