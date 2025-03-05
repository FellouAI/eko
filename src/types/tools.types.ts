export interface ComputerUseParam {
  action: string;
  coordinate?: [number, number];
  text?: string;
}

export interface ComputerUseResult {
  success: boolean;
  image?: ScreenshotImage;
  [key: string]: any;
}

export interface BrowserUseParam {
  action: string;
  index?: number;
  text?: string;
}

export interface BrowserUseResult {
  success: boolean;
  image?: ScreenshotImage;
  text?: string;
  [key: string]: any;
}

export interface ExportFileParam {
  content: string;
  fileType: 'txt' | 'csv' | 'md' | 'html' | 'js' | 'xml' | 'json' | 'yml' | 'sql';
  filename?: string;
}

export interface ExtractContentResult {
  tabId: number;
  result: {
    title?: string;
    url?: string;
    content: string;
  };
}

export interface OpenUrlParam {
  url: string;
  newWindow?: boolean;
}

export interface OpenUrlResult {
  tabId: number;
  windowId: number;
  title?: string;
}

export interface BrowserTab {
  id: number,
  url?: string,
  title?: string,
  content: string,
  description: string,
}

export interface ScreenshotResult {
  image: ScreenshotImage;
}

export interface ScreenshotImage {
  type: 'base64';
  media_type: 'image/png' | 'image/jpeg';
  data: string;
}

export interface TabManagementParam {
  command: string;
}

export type TabManagementResult = TabInfo | CloseTabInfo | TabInfo[];

export interface TabInfo {
  tabId?: number;
  windowId?: number;
  title?: string;
  url?: string;
  active?: boolean;
}

export interface CloseTabInfo {
  closedTabId: number;
  newTabId?: number;
  newTabTitle?: string;
}

export interface WebSearchParam {
  url?: string;
  query: string;
  maxResults?: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface TaskPrompt {
  task_prompt: string;
}

export interface ElementRect {
  left: number;
  top: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
}

export interface CancelWorkflowInput {
  reason: string;
}

export interface HumanInputTextInput {
  question: string;
}

export interface HumanInputTextResult {
  status: string;
  answer: string;
}

export interface HumanInputSingleChoiceInput {
  question: string;
  choices: string[];
}

export interface HumanInputSingleChoiceResult {
  status: string;
  answer: string;
}

export interface HumanInputMultipleChoiceInput {
  question: string;
  choices: string[];
}

export interface HumanInputMultipleChoiceResult {
  status: string;
  answer: string[];
}

export interface HumanOperateInput {
  reason: string,
}

export interface HumanOperateResult {
  status: string,
  userOperation: string,
}

export interface WorkflowSummary {
  isSuccessful: boolean,
  summary: string,
}

export interface DocumentAgentToolInput {
  type: string,
  title: string,
  background: string,
  keypoints: string,
  style?: string,
  references?: any,
}

export interface DocumentAgentToolOutput {
  status: string,
  content: string,
}