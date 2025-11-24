import { ICapability } from "./base";

/**
 * Capability constructor type
 */
type CapabilityConstructor = new (...args: any[]) => ICapability;

/**
 * Global capability registry
 * 
 * Maps capability names (strings) to their constructors, enabling
 * dynamic capability loading from serialized data (e.g., JSON).
 */
const registry = new Map<string, CapabilityConstructor>();

/**
 * Register a capability constructor
 * 
 * @param name Capability name (e.g., "file")
 * @param ctor Capability constructor
 */
export function registerCapability(
  name: string,
  ctor: CapabilityConstructor
): void {
  if (registry.has(name)) {
    console.warn(`Capability "${name}" is already registered, overwriting...`);
  }
  registry.set(name, ctor);
}

/**
 * Get a capability constructor by name
 * 
 * @param name Capability name
 * @returns Capability constructor or undefined if not found
 */
export function getCapabilityConstructor(
  name: string
): CapabilityConstructor | undefined {
  return registry.get(name);
}

/**
 * Create a capability instance by name
 * 
 * @param name Capability name
 * @param args Constructor arguments
 * @returns Capability instance or undefined if not found
 */
export function createCapability(
  name: string,
  ...args: any[]
): ICapability | undefined {
  const ctor = getCapabilityConstructor(name);
  if (!ctor) {
    return undefined;
  }
  return new ctor(...args);
}

/**
 * Get all registered capability names
 * 
 * @returns Array of registered capability names
 */
export function getRegisteredCapabilityNames(): string[] {
  return Array.from(registry.keys());
}

