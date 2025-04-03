import { ScreenshotResult } from '../../types/tools.types';
export declare function type(text: string, xpath?: string, highlightIndex?: number): boolean;
export declare function clear_input(xpath?: string, highlightIndex?: number): boolean;
export declare function left_click(xpath?: string, highlightIndex?: number): boolean;
export declare function right_click(xpath?: string, highlightIndex?: number): boolean;
export declare function double_click(xpath?: string, highlightIndex?: number): boolean;
export declare function screenshot(compress?: boolean): Promise<ScreenshotResult>;
export declare function compress_image(dataUrl: string, scale?: number, quality?: number): Promise<string>;
export declare function scroll_to(xpath?: string, highlightIndex?: number): boolean;
export declare function get_dropdown_options(xpath?: string, highlightIndex?: number): {
    options: Array<{
        index: number;
        text: string;
        value?: string;
    }>;
    id?: string;
    name?: string;
} | null;
export declare function select_dropdown_option(text: string, xpath?: string, highlightIndex?: number): any;
export declare function extractHtmlContent(): string;
export declare function size(): [number, number];
