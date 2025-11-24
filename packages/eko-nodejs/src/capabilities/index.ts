import { registerCapability } from "@eko-ai/eko";
import { BrowserCapability } from "./BrowserCapability";
import { FileCapability } from "./FileCapability";
import { ShellCapability } from "./ShellCapability";

// Register the capabilities
registerCapability("NodeBrowser", BrowserCapability);
registerCapability("File", FileCapability);
registerCapability("Shell", ShellCapability);

export { BrowserCapability, FileCapability, ShellCapability };

