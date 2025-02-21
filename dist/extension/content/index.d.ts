declare const eko: any;
declare function type(request: any): boolean;
declare function mouse_move(request: any): boolean;
declare function simulateMouseEvent(request: any, eventTypes: Array<string>, button: 0 | 1 | 2): boolean;
declare function scroll_to(request: any): boolean;
declare function get_dropdown_options(request: any): {
    options: {
        index: any;
        text: any;
        value: any;
    }[];
    id: any;
    name: any;
} | null;
declare function select_dropdown_option(request: any): any;
declare function request_user_help(task_id: string, failure_type: string, failure_message: string): void;
