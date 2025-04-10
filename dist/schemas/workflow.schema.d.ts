export declare const workflowSchema: {
    type: string;
    required: string[];
    properties: {
        thinking: {
            type: string;
            description: string;
        };
        id: {
            type: string;
        };
        name: {
            type: string;
        };
        description: {
            type: string;
        };
        nodes: {
            type: string;
            items: {
                type: string;
                required: string[];
                properties: {
                    id: {
                        type: string;
                    };
                    type: {
                        type: string;
                        enum: string[];
                    };
                    dependencies: {
                        type: string;
                        items: {
                            type: string;
                        };
                    };
                    output: {
                        type: string;
                        properties: {
                            name: {
                                type: string;
                            };
                            description: {
                                type: string;
                            };
                        };
                    };
                    action: {
                        type: string;
                        required: string[];
                        properties: {
                            type: {
                                type: string;
                                enum: string[];
                            };
                            name: {
                                type: string;
                            };
                            description: {
                                type: string;
                            };
                        };
                    };
                };
            };
        };
        variables: {
            type: string;
            additionalProperties: boolean;
        };
    };
};
