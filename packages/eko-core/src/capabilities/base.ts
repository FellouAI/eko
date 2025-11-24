import { Tool } from "../types";

/**
 * Capability interface
 * 
 * A Capability represents a reusable set of tools and guidance that can be
 * composed into an Agent. This enables composition-based agent design instead
 * of inheritance-based design.
 */
export interface ICapability {
  /** Unique capability name (e.g., "file", "browser") */
  name: string;

  /** Tools provided by this capability */
  get tools(): Tool[];

  /** Usage guide/prompt for this capability to be injected into system prompt */
  getGuide(): string;
}

/**
 * Base capability class
 * 
 * Provides common implementation for capabilities. Subclasses should:
 * 1. Set the `name` property
 * 2. Initialize `_tools` in constructor by calling `buildTools()`
 * 3. Implement `getGuide()` to return capability-specific guidance
 */
export abstract class BaseCapability implements ICapability {
  abstract name: string;
  protected _tools: Tool[] = [];

  get tools(): Tool[] {
    return this._tools;
  }

  abstract getGuide(): string;
}

