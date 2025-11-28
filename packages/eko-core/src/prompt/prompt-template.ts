export class PromptTemplate {
  /**
   * Simple template rendering method, does not support nesting.
   *
   * @param template - The prompt template to render.
   * Example:
   * ```
   * <if param1>
   * param1: {{param1}}
   * </if>
   * ----param2: {{param2}}
   * <if param3>
   * param3: {{param3}}
   * </if>
   * ```
   * @param data - The data to render the prompt template with.
   * Example:
   * ```
   * {
   *   param1: "value1",
   *   param2: "value2",
   *   param3: "value3",
   * }
   * ```
   * @returns The rendered prompt template.
   */
  public static render(template: string, data: Record<string, any>): string {
    let result = template;

    result = result.replace(
      /\n?<if\s+(\w+)>([\s\S]*?)<\/if>\n?/g,
      (match, varName, content) => {
        const value = data[varName];
        let hasValue = value !== undefined && value !== null && value !== "";
        if (hasValue && Array.isArray(value) && value.length == 0) {
          hasValue = false;
        }
        if (content.startsWith("\n")) {
          content = content.substring(1);
        }
        if (content.endsWith("\n")) {
          content = content.substring(0, content.length - 1);
        }
        if (!hasValue) {
          return "";
        }
        let result = this.replaceVars(content, data);
        if (match.startsWith("\n")) {
          result = "\n" + result;
        }
        if (match.endsWith("\n")) {
          result = result + "\n";
        }
        return result;
      }
    );

    result = this.replaceVars(result, data);

    return result;
  }

  private static replaceVars(text: string, data: Record<string, any>) {
    return text.replace(
      /\{\{([\w]+)\}\}/g,
      (match: string, varName: string) => {
        if (!(varName in data)) {
          return match;
        }
        const value = data[varName] ?? "";
        return typeof value == "string" ? value : JSON.stringify(value);
      }
    );
  }
}
