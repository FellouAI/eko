import { registerCapability } from "@eko-ai/eko";
import { BrowserCapability } from "./BrowserCapability";

// Register the Browser capability
registerCapability("Browser", BrowserCapability);

export { BrowserCapability };

