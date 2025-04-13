import { BrowserUseResult, ExecutionContext, InputSchema, Tool } from "@/types";
import { BrowserUse } from "./browser_use";
import { logger } from "@/common/log";

export abstract class ToolReturnsScreenshot<T> implements Tool<T, BrowserUseResult> {
  abstract name: string;
  abstract description: string;
  abstract input_schema: InputSchema;
  abstract realExecute(context: ExecutionContext, params: T): Promise<any>;

  async execute(context: ExecutionContext, params: T): Promise<BrowserUseResult> {
    const realResult = await this.realExecute(context, params);
    logger.debug("debug realResult...");
    logger.debug(realResult);
    let instance = new BrowserUse();
    const image = await instance.realExecute(context, { action: "screenshot_extract_element" });
    return image;
  }
}
