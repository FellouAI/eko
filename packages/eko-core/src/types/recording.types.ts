export enum EventType {
  NAVIGATION = "navigation",
  CLICK = "click", 
  INPUT = "input",
  SCROLL = "scroll",
  KEY_PRESS = "key_press"
}

export interface BrowserEvent {
  type: EventType;
  timestamp: number;
  tabId: number;
  url: string;
  frameUrl?: string;
  
  // For clicks and inputs
  cssSelector?: string;
  xpath?: string;
  elementTag?: string;
  elementText?: string;
  
  // For inputs
  value?: string;
  
  // For scrolls
  scrollX?: number;
  scrollY?: number;
  targetId?: number;
  
  // For key presses
  key?: string;
  
  // Optional metadata
  description?: string;
  output?: string;
  screenshot?: string;
  
  // Internal use
  _source_dir?: string;
}

export interface WorkflowRecording {
  workflow_analysis?: string;
  name: string;
  description?: string;
  version: string;
  steps: BrowserEvent[];
  input_schema?: any[];
}

export interface ConversionOptions {
  userGoal?: string;
  useScreenshots?: boolean;
  maxImages?: number;
  filterRedundantEvents?: boolean;
}

export interface ConversionResult {
  workflow: string; // XML string
  analysis: string;
  variables: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  nodeCount: number;
  actionNodeCount: number;
  agentNodeCount: number;
}