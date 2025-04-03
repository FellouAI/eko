export declare function can_use_computer(): Promise<boolean>;
export declare function key(key: string, coordinate?: [number, number]): Promise<boolean>;
export declare function type(text: string, coordinate?: [number, number]): Promise<boolean>;
export declare function mouse_move(coordinate: [number, number]): Promise<boolean>;
export declare function left_click(coordinate?: [number, number]): Promise<boolean>;
export declare function left_click_drag(coordinate: [number, number]): Promise<boolean>;
export declare function right_click(coordinate?: [number, number]): Promise<boolean>;
export declare function double_click(coordinate?: [number, number]): Promise<boolean>;
export declare function screenshot(windowId?: number): Promise<{
    image: {
        type: 'base64';
        media_type: 'image/png' | 'image/jpeg';
        data: string;
    };
}>;
export declare function cursor_position(): Promise<{
    coordinate: [number, number];
}>;
export declare function size(): Promise<[number, number]>;
export declare function scroll(coordinate: [number, number]): Promise<boolean>;
