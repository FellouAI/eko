/**
 * Get clickable elements on the page
 *
 * @param {*} doHighlightElements Is highlighted
 * @param {*} includeAttributes [attr_names...]
 * @returns { element_str, selector_map }
 */
declare function get_clickable_elements(doHighlightElements: any | undefined, includeAttributes: any): string;
declare function get_highlight_element(highlightIndex: any): any;
declare function remove_highlight(): void;
declare function clickable_elements_to_string(element_tree: any, includeAttributes: any): string;
declare function create_selector_map(element_tree: any, ignore_element_obj: any): {};
declare function parse_node(node_data: any, parent: any): {
    tagName: any;
    xpath: any;
    highlightIndex: any;
    attributes: any;
    isVisible: any;
    isInteractive: any;
    isTopElement: any;
    shadowRoot: any;
    children: never[];
    parent: any;
} | {
    text: any;
    isVisible: any;
    parent: any;
} | undefined;
declare function build_dom_tree(doHighlightElements: any): {
    tagName: any;
    attributes: {};
    xpath: string | null;
    children: never[];
} | {
    type: string;
    text: any;
    isVisible: boolean;
} | null;
