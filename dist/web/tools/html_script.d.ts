import { ElementRect } from '../../types/tools.types';
export declare function exportFile(filename: string, type: string, content: string): void;
export declare function xpath(element: any): string;
export declare function queryWithXpath(xpath: string): any;
/**
 * Extract the elements related to html operability and wrap them into pseudo-html code.
 */
export declare function extractOperableElements(): string;
export declare function clickOperableElement(id: any): any;
export declare function getOperableElementRect(id: any): ElementRect | null;
