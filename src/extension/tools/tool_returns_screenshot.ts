import { BrowserActionResult, ExecutionContext, InputSchema, Tool } from "@/types";
import { BrowserAction } from "./browser_action";
import { logger } from "@/common/log";
import { sleep } from "../utils";

export abstract class ToolReturnsScreenshot<T> implements Tool<T, BrowserActionResult> {
  abstract name: string;
  abstract description: string;
  abstract input_schema: InputSchema;
  abstract realExecute(context: ExecutionContext, params: T): Promise<any>;

  async execute(context: ExecutionContext, params: T): Promise<BrowserActionResult> {
    const realResult = await this.realExecute(context, params);
    logger.debug("debug realResult...");
    logger.debug(realResult);
    await sleep(3000); // wait for page loding
    let instance = new BrowserAction();
    const image = await instance.realExecute(context, { action: "screenshot_extract_element" });
    return image;
  }
}
