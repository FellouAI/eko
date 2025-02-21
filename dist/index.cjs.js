'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * Manages logging for action execution, providing a cleaner view of the execution
 * flow while maintaining important context and history.
 */
class ExecutionLogger {
    constructor(options = {}) {
        var _a;
        this.history = [];
        this.maxHistoryLength = options.maxHistoryLength || 10;
        this.logLevel = options.logLevel || 'info';
        this.includeTimestamp = (_a = options.includeTimestamp) !== null && _a !== void 0 ? _a : true;
        this.debugImagePath = options.debugImagePath;
        this.imageSaver = options.imageSaver;
        // Check if running in Node.js environment
        this.isNode =
            typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
    }
    /**
     * Logs a message with execution context
     */
    log(level, message, context) {
        if (this.shouldLog(level)) {
            const timestamp = this.includeTimestamp ? new Date().toISOString() : '';
            const contextSummary = this.summarizeContext(context);
            console.log(`${timestamp} [${level.toUpperCase()}] ${message}${contextSummary}`);
        }
    }
    /**
     * Updates conversation history while maintaining size limit
     */
    updateHistory(messages) {
        // Keep system messages and last N messages
        const systemMessages = messages.filter((m) => m.role === 'system');
        const nonSystemMessages = messages.filter((m) => m.role !== 'system');
        const recentMessages = nonSystemMessages.slice(-this.maxHistoryLength);
        this.history = [...systemMessages, ...recentMessages];
    }
    /**
     * Gets current conversation history
     */
    getHistory() {
        return this.history;
    }
    /**
     * Summarizes the execution context for logging
     */
    summarizeContext(context) {
        if (!context)
            return '';
        const summary = {
            variables: Object.fromEntries(context.variables),
            tools: context.tools ? Array.from(context.tools.keys()) : [],
        };
        return `\nContext: ${JSON.stringify(summary, null, 2)}`;
    }
    /**
     * Checks if message should be logged based on log level
     */
    shouldLog(level) {
        const levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
        };
        return levels[level] <= levels[this.logLevel];
    }
    /**
     * Logs the start of an action execution
     */
    logActionStart(actionName, input, context) {
        this.log('info', `Starting action: ${actionName}`, context);
        this.log('info', `Input: ${JSON.stringify(input, null, 2)}`);
    }
    /**
     * Logs the completion of an action execution
     */
    logActionComplete(actionName, result, context) {
        this.log('info', `Completed action: ${actionName}`, context);
        this.log('info', `Result: ${JSON.stringify(result, null, 2)}`);
    }
    /**
     * Logs a tool execution
     */
    logToolExecution(toolName, input, context) {
        this.log('info', `Executing tool: ${toolName}`);
        this.log('info', `Tool input: ${JSON.stringify(input, null, 2)}`);
    }
    /**
     * Logs an error that occurred during execution
     */
    logError(error, context) {
        console.error(error);
        try {
            this.log('error', `Error occurred: ${error.message}`, context);
            if (error.stack) {
                this.log('debug', `Stack trace: ${error.stack}`);
            }
        }
        catch (error) {
            console.error("An error occurs when trying to log another error:");
            console.error(error);
        }
    }
    extractFromDataUrl(dataUrl) {
        const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) {
            throw new Error('Invalid data URL format');
        }
        return {
            extension: matches[1],
            base64Data: matches[2],
        };
    }
    async saveDebugImage(imageData, toolName) {
        try {
            let extension;
            let base64Data;
            // Handle both data URL strings and ImageData objects
            if (typeof imageData === 'string' && imageData.startsWith('data:')) {
                const extracted = this.extractFromDataUrl(imageData);
                extension = extracted.extension;
                base64Data = extracted.base64Data;
            }
            else if (typeof imageData === 'object' && 'type' in imageData) {
                extension = imageData.media_type.split('/')[1] || 'png';
                base64Data = imageData.data;
            }
            else {
                return '[image]';
            }
            // If custom image saver is provided, use it
            if (this.imageSaver) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `${toolName}_${timestamp}.${extension}`;
                return await this.imageSaver({ type: 'base64', media_type: `image/${extension}`, data: base64Data }, filename);
            }
            // If in Node.js environment and debugImagePath is set
            if (this.isNode && this.debugImagePath) {
                // Dynamically import Node.js modules only when needed
                const { promises: fs } = await import('fs');
                const { join } = await import('path');
                await fs.mkdir(this.debugImagePath, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `${toolName}_${timestamp}.${extension}`;
                const filepath = join(this.debugImagePath, filename);
                const buffer = Buffer.from(base64Data, 'base64');
                await fs.writeFile(filepath, buffer);
                return `[image saved to: ${filepath}]`;
            }
            // Default case - just return placeholder
            return '[image]';
        }
        catch (error) {
            console.warn('Failed to save debug image:', error);
            return '[image]';
        }
    }
    async formatToolResult(result) {
        // Handle null/undefined
        if (result == null) {
            return 'null';
        }
        // Handle direct image result
        if (result.image) {
            const imagePlaceholder = await this.saveDebugImage(result.image, 'tool');
            const modifiedResult = { ...result, image: imagePlaceholder };
            return JSON.stringify(modifiedResult);
        }
        // Handle nested images in result object
        if (typeof result === 'object') {
            const formatted = { ...result };
            for (const [key, value] of Object.entries(formatted)) {
                if (value && typeof value === 'string' && value.startsWith('data:image/')) {
                    formatted[key] = await this.saveDebugImage(value, key);
                }
                else if (value &&
                    typeof value === 'object' &&
                    'type' in value &&
                    value.type === 'base64') {
                    formatted[key] = await this.saveDebugImage(value, key);
                }
            }
            return JSON.stringify(formatted);
        }
        // Handle primitive values
        return String(result);
    }
    async logToolResult(toolName, result, context) {
        if (this.shouldLog('info')) {
            const timestamp = this.includeTimestamp ? new Date().toISOString() : '';
            const contextSummary = this.summarizeContext(context);
            const formattedResult = await this.formatToolResult(result);
            console.log(`${timestamp} [INFO] Tool executed: ${toolName}\n` +
                `${timestamp} [INFO] Tool result: ${formattedResult}${contextSummary}`);
        }
    }
}

class WorkflowImpl {
    constructor(id, name, ekoConfig, description, nodes = [], variables = new Map(), llmProvider, loggerOptions) {
        this.id = id;
        this.name = name;
        this.ekoConfig = ekoConfig;
        this.description = description;
        this.nodes = nodes;
        this.variables = variables;
        this.llmProvider = llmProvider;
        this.abortControllers = new Map();
        if (loggerOptions) {
            this.logger = new ExecutionLogger(loggerOptions);
        }
    }
    setLogger(logger) {
        this.logger = logger;
    }
    async cancel() {
        this.abort = true;
        for (const controller of this.abortControllers.values()) {
            controller.abort("Workflow cancelled");
        }
    }
    async execute(callback) {
        var _a, _b, _c, _d;
        if (!this.validateDAG()) {
            throw new Error("Invalid workflow: Contains circular dependencies");
        }
        this.abort = false;
        callback && await ((_b = (_a = callback.hooks).beforeWorkflow) === null || _b === void 0 ? void 0 : _b.call(_a, this));
        const executed = new Set();
        const executing = new Set();
        const executeNode = async (nodeId) => {
            var _a, _b, _c, _d, _e;
            if (this.abort) {
                throw new Error("Abort");
            }
            if (executed.has(nodeId)) {
                return;
            }
            if (executing.has(nodeId)) {
                throw new Error(`Circular dependency detected at node: ${nodeId}`);
            }
            const node = this.getNode(nodeId);
            const abortController = new AbortController();
            this.abortControllers.set(nodeId, abortController);
            // Execute the node's action
            const context = {
                __skip: false,
                __abort: false,
                workflow: this,
                variables: this.variables,
                llmProvider: this.llmProvider,
                ekoConfig: this.ekoConfig,
                tools: new Map(node.action.tools.map(tool => [tool.name, tool])),
                callback,
                logger: this.logger,
                next: () => context.__skip = true,
                abortAll: () => {
                    this.abort = context.__abort = true;
                    // Abort all running tasks
                    for (const controller of this.abortControllers.values()) {
                        controller.abort("Workflow cancelled");
                    }
                },
                signal: abortController.signal
            };
            executing.add(nodeId);
            // Execute dependencies first
            for (const depId of node.dependencies) {
                await executeNode(depId);
            }
            // Prepare input by gathering outputs from dependencies
            const input = { items: [] };
            for (const depId of node.dependencies) {
                const depNode = this.getNode(depId);
                input.items.push(depNode.output);
            }
            node.input = input;
            // Run pre-execution hooks and execute action
            callback && await ((_b = (_a = callback.hooks).beforeSubtask) === null || _b === void 0 ? void 0 : _b.call(_a, node, context));
            if (context.__abort) {
                throw new Error("Abort");
            }
            else if (context.__skip) {
                return;
            }
            node.output.value = await node.action.execute(node.input, node.output, context);
            executing.delete(nodeId);
            executed.add(nodeId);
            callback && await ((_d = (_c = callback.hooks).afterSubtask) === null || _d === void 0 ? void 0 : _d.call(_c, node, context, (_e = node.output) === null || _e === void 0 ? void 0 : _e.value));
        };
        // Execute all terminal nodes (nodes with no dependents)
        const terminalNodes = this.nodes.filter(node => !this.nodes.some(n => n.dependencies.includes(node.id)));
        await Promise.all(terminalNodes.map(node => executeNode(node.id)));
        callback && await ((_d = (_c = callback.hooks).afterWorkflow) === null || _d === void 0 ? void 0 : _d.call(_c, this, this.variables));
        return terminalNodes.map(node => node.output);
    }
    addNode(node) {
        if (this.nodes.some(n => n.id === node.id)) {
            throw new Error(`Node with id ${node.id} already exists`);
        }
        this.nodes.push(node);
    }
    removeNode(nodeId) {
        const index = this.nodes.findIndex(n => n.id === nodeId);
        if (index === -1) {
            throw new Error(`Node with id ${nodeId} not found`);
        }
        // Check if any nodes depend on this one
        const dependentNodes = this.nodes.filter(n => n.dependencies.includes(nodeId));
        if (dependentNodes.length > 0) {
            throw new Error(`Cannot remove node ${nodeId}: Nodes ${dependentNodes.map(n => n.id).join(", ")} depend on it`);
        }
        this.nodes.splice(index, 1);
    }
    getNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) {
            throw new Error(`Node with id ${nodeId} not found`);
        }
        return node;
    }
    validateDAG() {
        const visited = new Set();
        const recursionStack = new Set();
        const hasCycle = (nodeId) => {
            if (recursionStack.has(nodeId)) {
                return true;
            }
            if (visited.has(nodeId)) {
                return false;
            }
            visited.add(nodeId);
            recursionStack.add(nodeId);
            const node = this.getNode(nodeId);
            for (const depId of node.dependencies) {
                if (hasCycle(depId)) {
                    return true;
                }
            }
            recursionStack.delete(nodeId);
            return false;
        };
        return !this.nodes.some(node => hasCycle(node.id));
    }
}

// src/models/action.ts
/**
 * Special tool that allows LLM to write values to context
 */
class WriteContextTool {
    constructor() {
        this.name = 'write_context';
        this.description = 'Write a value to the global workflow context. Use this to store important intermediate results, but only when a piece of information is essential for future reference but missing from the final output specification of the current action.';
        this.input_schema = {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'The key to store the value under',
                },
                value: {
                    type: 'string',
                    description: 'The value to store (must be JSON stringified if object/array)',
                },
            },
            required: ['key', 'value'],
        };
    }
    async execute(context, params) {
        const { key, value } = params;
        try {
            // Try to parse the value as JSON
            const parsedValue = JSON.parse(value);
            context.variables.set(key, parsedValue);
        }
        catch (_a) {
            // If parsing fails, store as string
            context.variables.set(key, value);
        }
        return { success: true, key, value };
    }
}
function createReturnTool(actionName, outputDescription, outputSchema) {
    return {
        name: 'return_output',
        description: `Return the final output of this action. Use this to return a value matching the required output schema (if specified) and the following description:
      ${outputDescription}

      You can either set 'use_tool_result=true' to return the result of a previous tool call, or explicitly specify 'value' with 'use_tool_result=false' to return a value according to your own understanding. Whenever possible, reuse tool results to avoid redundancy.
      `,
        input_schema: {
            type: 'object',
            properties: {
                use_tool_result: {
                    type: ['boolean'],
                    description: `Whether to use the latest tool result as output. When set to true, the 'value' parameter is ignored.`,
                },
                value: outputSchema || {
                    // Default to accepting any JSON value
                    type: ['string', 'number', 'boolean', 'object', 'null'],
                    description: 'The output value. Only provide a value if the previous tool result is not suitable for the output description. Otherwise, leave this as null.',
                },
            },
            required: ['use_tool_result', 'value'],
        },
        async execute(context, params) {
            context.variables.set(`__action_${actionName}_output`, params);
            return { success: true };
        },
    };
}
class ActionImpl {
    constructor(type, // Only support prompt type
    name, description, tools, llmProvider, llmConfig, config) {
        this.type = type;
        this.name = name;
        this.description = description;
        this.tools = tools;
        this.llmProvider = llmProvider;
        this.llmConfig = llmConfig;
        this.maxRounds = 10; // Default max rounds
        this.toolResults = new Map();
        this.logger = new ExecutionLogger();
        this.writeContextTool = new WriteContextTool();
        this.tools = [...tools, this.writeContextTool];
        if (config === null || config === void 0 ? void 0 : config.maxRounds) {
            this.maxRounds = config.maxRounds;
        }
    }
    async executeSingleRound(messages, params, toolMap, context) {
        this.logger = context.logger;
        const roundMessages = [];
        let hasToolUse = false;
        let response = null;
        // Buffer to collect into roundMessages
        let assistantTextMessage = '';
        let toolUseMessage = null;
        let toolResultMessage = null;
        // Track tool execution promise
        let toolExecutionPromise = null;
        // Listen for abort signal
        if (context.signal) {
            context.signal.addEventListener('abort', () => {
                context.__abort = true;
            });
        }
        const handler = {
            onContent: (content) => {
                if (content.trim()) {
                    assistantTextMessage += content;
                }
            },
            onToolUse: async (toolCall) => {
                this.logger.log('info', `Assistant: ${assistantTextMessage}`);
                this.logger.logToolExecution(toolCall.name, toolCall.input, context);
                hasToolUse = true;
                const tool = toolMap.get(toolCall.name);
                if (!tool) {
                    throw new Error(`Tool not found: ${toolCall.name}`);
                }
                toolUseMessage = {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool_use',
                            id: toolCall.id,
                            name: tool.name,
                            input: toolCall.input,
                        },
                    ],
                };
                // Store the promise of tool execution
                toolExecutionPromise = (async () => {
                    var _a;
                    try {
                        // beforeToolUse
                        context.__skip = false;
                        if (context.callback && context.callback.hooks.beforeToolUse) {
                            let modified_input = await context.callback.hooks.beforeToolUse(tool, context, toolCall.input);
                            if (modified_input) {
                                toolCall.input = modified_input;
                            }
                        }
                        if (context.__skip || context.__abort || ((_a = context.signal) === null || _a === void 0 ? void 0 : _a.aborted)) {
                            toolResultMessage = {
                                role: 'user',
                                content: [
                                    {
                                        type: 'tool_result',
                                        tool_use_id: toolCall.id,
                                        content: 'skip',
                                    },
                                ],
                            };
                            return;
                        }
                        // Execute the tool
                        let result = await tool.execute(context, toolCall.input);
                        // afterToolUse
                        if (context.callback && context.callback.hooks.afterToolUse) {
                            let modified_result = await context.callback.hooks.afterToolUse(tool, context, result);
                            if (modified_result) {
                                result = modified_result;
                            }
                        }
                        const result_has_image = result && result.image;
                        const resultContent = result_has_image
                            ? {
                                type: 'tool_result',
                                tool_use_id: toolCall.id,
                                content: result.text
                                    ? [
                                        { type: 'image', source: result.image },
                                        { type: 'text', text: result.text },
                                    ]
                                    : [{ type: 'image', source: result.image }],
                            }
                            : {
                                type: 'tool_result',
                                tool_use_id: toolCall.id,
                                content: [{ type: 'text', text: JSON.stringify(result) }],
                            };
                        const resultContentText = result_has_image
                            ? result.text
                                ? result.text + ' [Image]'
                                : '[Image]'
                            : JSON.stringify(result);
                        const resultMessage = {
                            role: 'user',
                            content: [resultContent],
                        };
                        toolResultMessage = resultMessage;
                        this.logger.logToolResult(tool.name, result, context);
                        // Store tool results except for the return_output tool
                        if (tool.name !== 'return_output') {
                            this.toolResults.set(toolCall.id, resultContentText);
                        }
                    }
                    catch (err) {
                        console.log("An error occurred when calling tool:");
                        console.log(err);
                        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
                        const errorResult = {
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: toolCall.id,
                                    content: [{ type: 'text', text: `Error: ${errorMessage}` }],
                                    is_error: true,
                                },
                            ],
                        };
                        toolResultMessage = errorResult;
                        this.logger.logError(err, context);
                    }
                })();
            },
            onComplete: (llmResponse) => {
                response = llmResponse;
            },
            onError: (error) => {
                console.error('Stream Error:', error);
                console.log('Last message array sent to LLM:', JSON.stringify(messages, null, 2));
            },
        };
        this.handleHistoryImageMessages(messages);
        // Wait for stream to complete
        if (!this.llmProvider) {
            throw new Error('LLM provider not set');
        }
        await this.llmProvider.generateStream(messages, params, handler);
        // Wait for tool execution to complete if it was started
        if (toolExecutionPromise) {
            await toolExecutionPromise;
        }
        if (context.__abort) {
            throw new Error('Abort');
        }
        // Add messages in the correct order after everything is complete
        if (assistantTextMessage) {
            roundMessages.push({ role: 'assistant', content: assistantTextMessage });
        }
        if (toolUseMessage) {
            roundMessages.push(toolUseMessage);
        }
        if (toolResultMessage) {
            roundMessages.push(toolResultMessage);
        }
        return { response, hasToolUse, roundMessages };
    }
    handleHistoryImageMessages(messages) {
        // Remove all images from historical tool results except the most recent user message
        const initialImageCount = this.countImages(messages);
        let foundFirstUser = false;
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role === 'user') {
                if (!foundFirstUser) {
                    foundFirstUser = true;
                    continue;
                }
                if (Array.isArray(message.content)) {
                    // Directly modify the message content array
                    message.content = message.content.map((item) => {
                        if (item.type === 'tool_result' && Array.isArray(item.content)) {
                            // Create a new content array without images
                            if (item.content.length > 0) {
                                item.content = item.content.filter((c) => c.type !== 'image');
                                // If all content was images and got filtered out, replace with ok message
                                if (item.content.length === 0) {
                                    item.content = [{ type: 'text', text: 'ok' }];
                                }
                            }
                        }
                        return item;
                    });
                }
            }
        }
        const finalImageCount = this.countImages(messages);
        if (initialImageCount !== finalImageCount) {
            this.logger.log("info", `Removed ${initialImageCount - finalImageCount} images from history`);
        }
    }
    countImages(messages) {
        let count = 0;
        messages.forEach(msg => {
            if (Array.isArray(msg.content)) {
                msg.content.forEach((item) => {
                    if (item.type === 'tool_result' && Array.isArray(item.content)) {
                        count += item.content.filter((c) => c.type === 'image').length;
                    }
                });
            }
        });
        return count;
    }
    async execute(input, output, context, outputSchema) {
        var _a, _b, _c, _d, _e;
        this.logger = context.logger;
        console.log(`Executing action started: ${this.name}`);
        // Create return tool with output schema
        const returnTool = createReturnTool(this.name, output.description, outputSchema);
        // Create tool map combining context tools, action tools, and return tool
        const toolMap = new Map();
        this.tools.forEach((tool) => toolMap.set(tool.name, tool));
        (_a = context.tools) === null || _a === void 0 ? void 0 : _a.forEach((tool) => toolMap.set(tool.name, tool));
        toolMap.set(returnTool.name, returnTool);
        // Prepare initial messages
        const messages = [
            { role: 'system', content: this.formatSystemPrompt() },
            { role: 'user', content: this.formatUserPrompt(context, input) },
        ];
        this.logger.logActionStart(this.name, input, context);
        // Configure tool parameters
        const params = {
            ...this.llmConfig,
            tools: Array.from(toolMap.values()).map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.input_schema,
            })),
        };
        let roundCount = 0;
        while (roundCount < this.maxRounds) {
            // Check for abort signal
            if ((_b = context.signal) === null || _b === void 0 ? void 0 : _b.aborted) {
                throw new Error('Workflow cancelled');
            }
            roundCount++;
            this.logger.log('info', `Starting round ${roundCount} of ${this.maxRounds}`, context);
            const { response, hasToolUse, roundMessages } = await this.executeSingleRound(messages, params, toolMap, context);
            if (response === null || response === void 0 ? void 0 : response.textContent) {
                (_e = (_d = (_c = context.callback) === null || _c === void 0 ? void 0 : _c.hooks) === null || _d === void 0 ? void 0 : _d.onLlmMessage) === null || _e === void 0 ? void 0 : _e.call(_d, response.textContent);
            }
            // Add round messages to conversation history
            messages.push(...roundMessages);
            this.logger.log('debug', `Round ${roundCount} messages: ${JSON.stringify(roundMessages)}`, context);
            // Check termination conditions
            if (!hasToolUse && response) {
                // LLM sent a message without using tools - request explicit return
                this.logger.log('info', `Assistant: ${response.textContent}`);
                this.logger.log('warn', 'LLM sent a message without using tools; requesting explicit return');
                const returnOnlyParams = {
                    ...params,
                    tools: [
                        {
                            name: returnTool.name,
                            description: returnTool.description,
                            input_schema: returnTool.input_schema,
                        },
                    ],
                };
                messages.push({
                    role: 'user',
                    content: 'Please process the above information and return a final result using the return_output tool.',
                });
                const { roundMessages: finalRoundMessages } = await this.executeSingleRound(messages, returnOnlyParams, new Map([[returnTool.name, returnTool]]), context);
                messages.push(...finalRoundMessages);
                break;
            }
            if (response === null || response === void 0 ? void 0 : response.toolCalls.some((call) => call.name === 'return_output')) {
                break;
            }
            // If this is the last round, force an explicit return
            if (roundCount === this.maxRounds) {
                this.logger.log('warn', 'Max rounds reached, requesting explicit return');
                const returnOnlyParams = {
                    ...params,
                    tools: [
                        {
                            name: returnTool.name,
                            description: returnTool.description,
                            input_schema: returnTool.input_schema,
                        },
                    ],
                };
                messages.push({
                    role: 'user',
                    content: 'Maximum number of steps reached. Please return the best result possible with the return_output tool.',
                });
                const { roundMessages: finalRoundMessages } = await this.executeSingleRound(messages, returnOnlyParams, new Map([[returnTool.name, returnTool]]), context);
                messages.push(...finalRoundMessages);
            }
        }
        // Get and clean up output value
        const outputKey = `__action_${this.name}_output`;
        const outputParams = context.variables.get(outputKey);
        context.variables.delete(outputKey);
        // Get output value, first checking for use_tool_result
        const outputValue = outputParams.use_tool_result
            ? Array.from(this.toolResults.values()).pop()
            : outputParams === null || outputParams === void 0 ? void 0 : outputParams.value;
        if (outputValue === undefined) {
            console.warn('Action completed without returning a value');
            return {};
        }
        return outputValue;
    }
    formatSystemPrompt() {
        return `You are a subtask executor. You need to complete the subtask specified by the user, which is a consisting part of the overall task. Help the user by calling the tools provided.

    Remember to:
    1. Use tools when needed to accomplish the task
    2. Think step by step about what needs to be done
    3. Return the output of the subtask using the 'return_output' tool when you are done; prefer using the 'tool_use_id' parameter to refer to the output of a tool call over providing a long text as the value
    4. Use the context to store important information for later reference, but use it sparingly: most of the time, the output of the subtask should be sufficient for the next steps
    5. If there are any unclear points during the task execution, please use the human-related tool to inquire with the user
    6. If user intervention is required during the task execution, please use the human-related tool to transfer the operation rights to the user
    `;
    }
    formatUserPrompt(context, input) {
        var _a;
        const workflowDescription = ((_a = context.workflow) === null || _a === void 0 ? void 0 : _a.description) || null;
        const actionDescription = `${this.name} -- ${this.description}`;
        const inputDescription = JSON.stringify(input, null, 2) || null;
        const contextVariables = Array.from(context.variables.entries())
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join('\n');
        return `You are executing a subtask in the workflow. The workflow description is as follows:
    ${workflowDescription}

    The subtask description is as follows:
    ${actionDescription}

    The input to the subtask is as follows:
    ${inputDescription}

    There are some variables stored in the context that you can use for reference:
    ${contextVariables}
    `;
    }
    // Static factory method
    static createPromptAction(name, description, tools, llmProvider, llmConfig) {
        return new ActionImpl('prompt', name, description, tools, llmProvider, llmConfig);
    }
}

// src/services/workflow/templates.ts
function createWorkflowPrompts(tools) {
    return {
        formatSystemPrompt: () => {
            const toolDescriptions = tools
                .map((tool) => `
Tool: ${tool.name}
Description: ${tool.description}
Input Schema: ${JSON.stringify(tool.input_schema, null, 2)}
        `)
                .join('\n');
            return `You are a workflow generation assistant that creates Eko framework workflows.
The following tools are available:

${toolDescriptions}

Generate a complete workflow that:
1. Only uses the tools listed above
2. Properly sequences tool usage based on dependencies
3. Ensures each action has appropriate input/output schemas, and that the "tools" field in each action is populated with the sufficient subset of all available tools needed to complete the action
4. Creates a clear, logical flow to accomplish the user's goal
5. Includes detailed descriptions for each action, ensuring that the actions, when combined, is a complete solution to the user's problem
6. You should always add a SubTask at the end of the workflow to summarize it, and this SubTask should always call the "summary_workflow" tool. It's dependencies should be all of the SubTasks`;
        },
        formatUserPrompt: (requirement) => `Create a workflow for the following requirement: ${requirement}`,
        modifyUserPrompt: (prompt) => `Modify workflow: ${prompt}`,
    };
}
function createWorkflowGenerationTool(registry) {
    return {
        name: 'generate_workflow',
        description: `Generate a workflow following the Eko framework DSL schema.
The workflow must only use the available tools and ensure proper dependencies between nodes.`,
        input_schema: {
            type: 'object',
            properties: {
                workflow: registry.getWorkflowSchema(),
            },
            required: ['workflow'],
        },
    };
}

const byteToHex = [];
for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 0x100).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
    return (byteToHex[arr[offset + 0]] +
        byteToHex[arr[offset + 1]] +
        byteToHex[arr[offset + 2]] +
        byteToHex[arr[offset + 3]] +
        '-' +
        byteToHex[arr[offset + 4]] +
        byteToHex[arr[offset + 5]] +
        '-' +
        byteToHex[arr[offset + 6]] +
        byteToHex[arr[offset + 7]] +
        '-' +
        byteToHex[arr[offset + 8]] +
        byteToHex[arr[offset + 9]] +
        '-' +
        byteToHex[arr[offset + 10]] +
        byteToHex[arr[offset + 11]] +
        byteToHex[arr[offset + 12]] +
        byteToHex[arr[offset + 13]] +
        byteToHex[arr[offset + 14]] +
        byteToHex[arr[offset + 15]]).toLowerCase();
}

let getRandomValues;
const rnds8 = new Uint8Array(16);
function rng() {
    if (!getRandomValues) {
        if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
            throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
        }
        getRandomValues = crypto.getRandomValues.bind(crypto);
    }
    return getRandomValues(rnds8);
}

const randomUUID = typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID.bind(crypto);
var native = { randomUUID };

function v4(options, buf, offset) {
    if (native.randomUUID && true && !options) {
        return native.randomUUID();
    }
    options = options || {};
    const rnds = options.random ?? options.rng?.() ?? rng();
    if (rnds.length < 16) {
        throw new Error('Random bytes length must be >= 16');
    }
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;
    return unsafeStringify(rnds);
}

class WorkflowGenerator {
    constructor(llmProvider, toolRegistry) {
        this.llmProvider = llmProvider;
        this.toolRegistry = toolRegistry;
        this.message_history = [];
    }
    async generateWorkflow(prompt, ekoConfig) {
        return this.doGenerateWorkflow(prompt, false, ekoConfig);
    }
    async generateWorkflowFromJson(json, ekoConfig) {
        return this.createWorkflowFromData(json, ekoConfig);
    }
    async modifyWorkflow(prompt, ekoConfig) {
        return this.doGenerateWorkflow(prompt, true, ekoConfig);
    }
    async doGenerateWorkflow(prompt, modify, ekoConfig) {
        // Create prompts with current set of tools
        const prompts = createWorkflowPrompts(this.toolRegistry.getToolDefinitions());
        let messages = [];
        if (modify) {
            messages = this.message_history;
            messages.push({
                role: 'user',
                content: prompts.modifyUserPrompt(prompt),
            });
        }
        else {
            messages = this.message_history = [
                {
                    role: 'system',
                    content: prompts.formatSystemPrompt(),
                },
                {
                    role: 'user',
                    content: prompts.formatUserPrompt(prompt),
                },
            ];
        }
        const params = {
            temperature: 0.7,
            maxTokens: 8192,
            tools: [createWorkflowGenerationTool(this.toolRegistry)],
            toolChoice: { type: 'tool', name: 'generate_workflow' },
        };
        const response = await this.llmProvider.generateText(messages, params);
        if (!response.toolCalls.length || !response.toolCalls[0].input.workflow) {
            messages.pop();
            throw new Error('Failed to generate workflow: Invalid response from LLM');
        }
        messages.push({
            role: 'assistant',
            content: [
                {
                    type: 'tool_use',
                    id: response.toolCalls[0].id,
                    name: response.toolCalls[0].name,
                    input: response.toolCalls[0].input,
                },
            ],
        }, {
            role: 'user',
            content: [
                {
                    type: 'tool_result',
                    tool_use_id: response.toolCalls[0].id,
                    content: 'ok',
                },
            ],
        });
        const workflowData = response.toolCalls[0].input.workflow;
        // Validate all tools exist
        for (const node of workflowData.nodes) {
            if (!this.toolRegistry.hasTools(node.action.tools)) {
                throw new Error(`Workflow contains undefined tools: ${node.action.tools}`);
            }
        }
        // Generate a new UUID if not provided
        if (!workflowData.id) {
            workflowData.id = v4();
        }
        // debug
        console.log("Debug the workflow...");
        console.log(workflowData);
        console.log("Debug the workflow...Done");
        return this.createWorkflowFromData(workflowData, ekoConfig);
    }
    createWorkflowFromData(data, ekoConfig) {
        const workflow = new WorkflowImpl(data.id, data.name, ekoConfig, data.description || '', [], new Map(Object.entries(data.variables || {})), this.llmProvider, {
            logLevel: 'info',
            includeTimestamp: true,
        });
        // Add nodes to workflow
        if (Array.isArray(data.nodes)) {
            data.nodes.forEach((nodeData) => {
                const tools = nodeData.action.tools.map((toolName) => this.toolRegistry.getTool(toolName));
                const action = ActionImpl.createPromptAction(nodeData.action.name, nodeData.action.description, tools, this.llmProvider, { maxTokens: 8192 });
                const node = {
                    id: nodeData.id,
                    name: nodeData.name || nodeData.id,
                    input: nodeData.input || { type: 'any', schema: {}, value: undefined },
                    output: nodeData.output || { type: 'any', schema: {}, value: undefined },
                    action: action,
                    dependencies: nodeData.dependencies || [],
                };
                workflow.addNode(node);
            });
        }
        return workflow;
    }
}

const VERSION$1 = '0.33.1'; // x-release-please-version

let auto$1 = false;
let kind$1 = undefined;
let fetch$2 = undefined;
let File$2 = undefined;
let ReadableStream$2 = undefined;
let getDefaultAgent$1 = undefined;
let fileFromPath$1 = undefined;
function setShims$1(shims, options = { auto: false }) {
    if (auto$1) {
        throw new Error(`you must \`import '@anthropic-ai/sdk/shims/${shims.kind}'\` before importing anything else from @anthropic-ai/sdk`);
    }
    if (kind$1) {
        throw new Error(`can't \`import '@anthropic-ai/sdk/shims/${shims.kind}'\` after \`import '@anthropic-ai/sdk/shims/${kind$1}'\``);
    }
    auto$1 = options.auto;
    kind$1 = shims.kind;
    fetch$2 = shims.fetch;
    File$2 = shims.File;
    ReadableStream$2 = shims.ReadableStream;
    getDefaultAgent$1 = shims.getDefaultAgent;
    fileFromPath$1 = shims.fileFromPath;
}

/**
 * Disclaimer: modules in _shims aren't intended to be imported by SDK users.
 */
let MultipartBody$1 = class MultipartBody {
    constructor(body) {
        this.body = body;
    }
    get [Symbol.toStringTag]() {
        return 'MultipartBody';
    }
};

function getRuntime$1({ manuallyImported } = {}) {
    const recommendation = manuallyImported ?
        `You may need to use polyfills`
        : `Add one of these imports before your first \`import … from '@anthropic-ai/sdk'\`:
- \`import '@anthropic-ai/sdk/shims/node'\` (if you're running on Node)
- \`import '@anthropic-ai/sdk/shims/web'\` (otherwise)
`;
    let _fetch, _Request, _Response, _Headers;
    try {
        // @ts-ignore
        _fetch = fetch;
        // @ts-ignore
        _Request = Request;
        // @ts-ignore
        _Response = Response;
        // @ts-ignore
        _Headers = Headers;
    }
    catch (error) {
        throw new Error(`this environment is missing the following Web Fetch API type: ${error.message}. ${recommendation}`);
    }
    return {
        kind: 'web',
        fetch: _fetch,
        Request: _Request,
        Response: _Response,
        Headers: _Headers,
        FormData: 
        // @ts-ignore
        typeof FormData !== 'undefined' ? FormData : (class FormData {
            // @ts-ignore
            constructor() {
                throw new Error(`file uploads aren't supported in this environment yet as 'FormData' is undefined. ${recommendation}`);
            }
        }),
        Blob: typeof Blob !== 'undefined' ? Blob : (class Blob {
            constructor() {
                throw new Error(`file uploads aren't supported in this environment yet as 'Blob' is undefined. ${recommendation}`);
            }
        }),
        File: 
        // @ts-ignore
        typeof File !== 'undefined' ? File : (class File {
            // @ts-ignore
            constructor() {
                throw new Error(`file uploads aren't supported in this environment yet as 'File' is undefined. ${recommendation}`);
            }
        }),
        ReadableStream: 
        // @ts-ignore
        typeof ReadableStream !== 'undefined' ? ReadableStream : (class ReadableStream {
            // @ts-ignore
            constructor() {
                throw new Error(`streaming isn't supported in this environment yet as 'ReadableStream' is undefined. ${recommendation}`);
            }
        }),
        getMultipartRequestOptions: async (
        // @ts-ignore
        form, opts) => ({
            ...opts,
            body: new MultipartBody$1(form),
        }),
        getDefaultAgent: (url) => undefined,
        fileFromPath: () => {
            throw new Error('The `fileFromPath` function is only supported in Node. See the README for more details: https://www.github.com/anthropics/anthropic-sdk-typescript#file-uploads');
        },
        isFsReadStream: (value) => false,
    };
}

/**
 * Disclaimer: modules in _shims aren't intended to be imported by SDK users.
 */
if (!kind$1) setShims$1(getRuntime$1(), { auto: true });

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class AnthropicError extends Error {
}
let APIError$1 = class APIError extends AnthropicError {
    constructor(status, error, message, headers) {
        super(`${APIError.makeMessage(status, error, message)}`);
        this.status = status;
        this.headers = headers;
        this.request_id = headers?.['request-id'];
        this.error = error;
    }
    static makeMessage(status, error, message) {
        const msg = error?.message ?
            typeof error.message === 'string' ?
                error.message
                : JSON.stringify(error.message)
            : error ? JSON.stringify(error)
                : message;
        if (status && msg) {
            return `${status} ${msg}`;
        }
        if (status) {
            return `${status} status code (no body)`;
        }
        if (msg) {
            return msg;
        }
        return '(no status code or body)';
    }
    static generate(status, errorResponse, message, headers) {
        if (!status || !headers) {
            return new APIConnectionError$1({ message, cause: castToError$1(errorResponse) });
        }
        const error = errorResponse;
        if (status === 400) {
            return new BadRequestError$1(status, error, message, headers);
        }
        if (status === 401) {
            return new AuthenticationError$1(status, error, message, headers);
        }
        if (status === 403) {
            return new PermissionDeniedError$1(status, error, message, headers);
        }
        if (status === 404) {
            return new NotFoundError$1(status, error, message, headers);
        }
        if (status === 409) {
            return new ConflictError$1(status, error, message, headers);
        }
        if (status === 422) {
            return new UnprocessableEntityError$1(status, error, message, headers);
        }
        if (status === 429) {
            return new RateLimitError$1(status, error, message, headers);
        }
        if (status >= 500) {
            return new InternalServerError$1(status, error, message, headers);
        }
        return new APIError(status, error, message, headers);
    }
};
let APIUserAbortError$1 = class APIUserAbortError extends APIError$1 {
    constructor({ message } = {}) {
        super(undefined, undefined, message || 'Request was aborted.', undefined);
    }
};
let APIConnectionError$1 = class APIConnectionError extends APIError$1 {
    constructor({ message, cause }) {
        super(undefined, undefined, message || 'Connection error.', undefined);
        // in some environments the 'cause' property is already declared
        // @ts-ignore
        if (cause)
            this.cause = cause;
    }
};
let APIConnectionTimeoutError$1 = class APIConnectionTimeoutError extends APIConnectionError$1 {
    constructor({ message } = {}) {
        super({ message: message ?? 'Request timed out.' });
    }
};
let BadRequestError$1 = class BadRequestError extends APIError$1 {
};
let AuthenticationError$1 = class AuthenticationError extends APIError$1 {
};
let PermissionDeniedError$1 = class PermissionDeniedError extends APIError$1 {
};
let NotFoundError$1 = class NotFoundError extends APIError$1 {
};
let ConflictError$1 = class ConflictError extends APIError$1 {
};
let UnprocessableEntityError$1 = class UnprocessableEntityError extends APIError$1 {
};
let RateLimitError$1 = class RateLimitError extends APIError$1 {
};
let InternalServerError$1 = class InternalServerError extends APIError$1 {
};

/**
 * A re-implementation of httpx's `LineDecoder` in Python that handles incrementally
 * reading lines from text.
 *
 * https://github.com/encode/httpx/blob/920333ea98118e9cf617f246905d7b202510941c/httpx/_decoders.py#L258
 */
let LineDecoder$1 = class LineDecoder {
    constructor() {
        this.buffer = [];
        this.trailingCR = false;
    }
    decode(chunk) {
        let text = this.decodeText(chunk);
        if (this.trailingCR) {
            text = '\r' + text;
            this.trailingCR = false;
        }
        if (text.endsWith('\r')) {
            this.trailingCR = true;
            text = text.slice(0, -1);
        }
        if (!text) {
            return [];
        }
        const trailingNewline = LineDecoder.NEWLINE_CHARS.has(text[text.length - 1] || '');
        let lines = text.split(LineDecoder.NEWLINE_REGEXP);
        // if there is a trailing new line then the last entry will be an empty
        // string which we don't care about
        if (trailingNewline) {
            lines.pop();
        }
        if (lines.length === 1 && !trailingNewline) {
            this.buffer.push(lines[0]);
            return [];
        }
        if (this.buffer.length > 0) {
            lines = [this.buffer.join('') + lines[0], ...lines.slice(1)];
            this.buffer = [];
        }
        if (!trailingNewline) {
            this.buffer = [lines.pop() || ''];
        }
        return lines;
    }
    decodeText(bytes) {
        if (bytes == null)
            return '';
        if (typeof bytes === 'string')
            return bytes;
        // Node:
        if (typeof Buffer !== 'undefined') {
            if (bytes instanceof Buffer) {
                return bytes.toString();
            }
            if (bytes instanceof Uint8Array) {
                return Buffer.from(bytes).toString();
            }
            throw new AnthropicError(`Unexpected: received non-Uint8Array (${bytes.constructor.name}) stream chunk in an environment with a global "Buffer" defined, which this library assumes to be Node. Please report this error.`);
        }
        // Browser
        if (typeof TextDecoder !== 'undefined') {
            if (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) {
                this.textDecoder ?? (this.textDecoder = new TextDecoder('utf8'));
                return this.textDecoder.decode(bytes);
            }
            throw new AnthropicError(`Unexpected: received non-Uint8Array/ArrayBuffer (${bytes.constructor.name}) in a web platform. Please report this error.`);
        }
        throw new AnthropicError(`Unexpected: neither Buffer nor TextDecoder are available as globals. Please report this error.`);
    }
    flush() {
        if (!this.buffer.length && !this.trailingCR) {
            return [];
        }
        const lines = [this.buffer.join('')];
        this.buffer = [];
        this.trailingCR = false;
        return lines;
    }
};
// prettier-ignore
LineDecoder$1.NEWLINE_CHARS = new Set(['\n', '\r']);
LineDecoder$1.NEWLINE_REGEXP = /\r\n|[\n\r]/g;

let Stream$1 = class Stream {
    constructor(iterator, controller) {
        this.iterator = iterator;
        this.controller = controller;
    }
    static fromSSEResponse(response, controller) {
        let consumed = false;
        async function* iterator() {
            if (consumed) {
                throw new Error('Cannot iterate over a consumed stream, use `.tee()` to split the stream.');
            }
            consumed = true;
            let done = false;
            try {
                for await (const sse of _iterSSEMessages$1(response, controller)) {
                    if (sse.event === 'completion') {
                        try {
                            yield JSON.parse(sse.data);
                        }
                        catch (e) {
                            console.error(`Could not parse message into JSON:`, sse.data);
                            console.error(`From chunk:`, sse.raw);
                            throw e;
                        }
                    }
                    if (sse.event === 'message_start' ||
                        sse.event === 'message_delta' ||
                        sse.event === 'message_stop' ||
                        sse.event === 'content_block_start' ||
                        sse.event === 'content_block_delta' ||
                        sse.event === 'content_block_stop') {
                        try {
                            yield JSON.parse(sse.data);
                        }
                        catch (e) {
                            console.error(`Could not parse message into JSON:`, sse.data);
                            console.error(`From chunk:`, sse.raw);
                            throw e;
                        }
                    }
                    if (sse.event === 'ping') {
                        continue;
                    }
                    if (sse.event === 'error') {
                        throw APIError$1.generate(undefined, `SSE Error: ${sse.data}`, sse.data, createResponseHeaders$1(response.headers));
                    }
                }
                done = true;
            }
            catch (e) {
                // If the user calls `stream.controller.abort()`, we should exit without throwing.
                if (e instanceof Error && e.name === 'AbortError')
                    return;
                throw e;
            }
            finally {
                // If the user `break`s, abort the ongoing request.
                if (!done)
                    controller.abort();
            }
        }
        return new Stream(iterator, controller);
    }
    /**
     * Generates a Stream from a newline-separated ReadableStream
     * where each item is a JSON value.
     */
    static fromReadableStream(readableStream, controller) {
        let consumed = false;
        async function* iterLines() {
            const lineDecoder = new LineDecoder$1();
            const iter = readableStreamAsyncIterable(readableStream);
            for await (const chunk of iter) {
                for (const line of lineDecoder.decode(chunk)) {
                    yield line;
                }
            }
            for (const line of lineDecoder.flush()) {
                yield line;
            }
        }
        async function* iterator() {
            if (consumed) {
                throw new Error('Cannot iterate over a consumed stream, use `.tee()` to split the stream.');
            }
            consumed = true;
            let done = false;
            try {
                for await (const line of iterLines()) {
                    if (done)
                        continue;
                    if (line)
                        yield JSON.parse(line);
                }
                done = true;
            }
            catch (e) {
                // If the user calls `stream.controller.abort()`, we should exit without throwing.
                if (e instanceof Error && e.name === 'AbortError')
                    return;
                throw e;
            }
            finally {
                // If the user `break`s, abort the ongoing request.
                if (!done)
                    controller.abort();
            }
        }
        return new Stream(iterator, controller);
    }
    [Symbol.asyncIterator]() {
        return this.iterator();
    }
    /**
     * Splits the stream into two streams which can be
     * independently read from at different speeds.
     */
    tee() {
        const left = [];
        const right = [];
        const iterator = this.iterator();
        const teeIterator = (queue) => {
            return {
                next: () => {
                    if (queue.length === 0) {
                        const result = iterator.next();
                        left.push(result);
                        right.push(result);
                    }
                    return queue.shift();
                },
            };
        };
        return [
            new Stream(() => teeIterator(left), this.controller),
            new Stream(() => teeIterator(right), this.controller),
        ];
    }
    /**
     * Converts this stream to a newline-separated ReadableStream of
     * JSON stringified values in the stream
     * which can be turned back into a Stream with `Stream.fromReadableStream()`.
     */
    toReadableStream() {
        const self = this;
        let iter;
        const encoder = new TextEncoder();
        return new ReadableStream$2({
            async start() {
                iter = self[Symbol.asyncIterator]();
            },
            async pull(ctrl) {
                try {
                    const { value, done } = await iter.next();
                    if (done)
                        return ctrl.close();
                    const bytes = encoder.encode(JSON.stringify(value) + '\n');
                    ctrl.enqueue(bytes);
                }
                catch (err) {
                    ctrl.error(err);
                }
            },
            async cancel() {
                await iter.return?.();
            },
        });
    }
};
async function* _iterSSEMessages$1(response, controller) {
    if (!response.body) {
        controller.abort();
        throw new AnthropicError(`Attempted to iterate over a response with no body`);
    }
    const sseDecoder = new SSEDecoder$1();
    const lineDecoder = new LineDecoder$1();
    const iter = readableStreamAsyncIterable(response.body);
    for await (const sseChunk of iterSSEChunks$1(iter)) {
        for (const line of lineDecoder.decode(sseChunk)) {
            const sse = sseDecoder.decode(line);
            if (sse)
                yield sse;
        }
    }
    for (const line of lineDecoder.flush()) {
        const sse = sseDecoder.decode(line);
        if (sse)
            yield sse;
    }
}
/**
 * Given an async iterable iterator, iterates over it and yields full
 * SSE chunks, i.e. yields when a double new-line is encountered.
 */
async function* iterSSEChunks$1(iterator) {
    let data = new Uint8Array();
    for await (const chunk of iterator) {
        if (chunk == null) {
            continue;
        }
        const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk)
            : typeof chunk === 'string' ? new TextEncoder().encode(chunk)
                : chunk;
        let newData = new Uint8Array(data.length + binaryChunk.length);
        newData.set(data);
        newData.set(binaryChunk, data.length);
        data = newData;
        let patternIndex;
        while ((patternIndex = findDoubleNewlineIndex$1(data)) !== -1) {
            yield data.slice(0, patternIndex);
            data = data.slice(patternIndex);
        }
    }
    if (data.length > 0) {
        yield data;
    }
}
function findDoubleNewlineIndex$1(buffer) {
    // This function searches the buffer for the end patterns (\r\r, \n\n, \r\n\r\n)
    // and returns the index right after the first occurrence of any pattern,
    // or -1 if none of the patterns are found.
    const newline = 0x0a; // \n
    const carriage = 0x0d; // \r
    for (let i = 0; i < buffer.length - 2; i++) {
        if (buffer[i] === newline && buffer[i + 1] === newline) {
            // \n\n
            return i + 2;
        }
        if (buffer[i] === carriage && buffer[i + 1] === carriage) {
            // \r\r
            return i + 2;
        }
        if (buffer[i] === carriage &&
            buffer[i + 1] === newline &&
            i + 3 < buffer.length &&
            buffer[i + 2] === carriage &&
            buffer[i + 3] === newline) {
            // \r\n\r\n
            return i + 4;
        }
    }
    return -1;
}
let SSEDecoder$1 = class SSEDecoder {
    constructor() {
        this.event = null;
        this.data = [];
        this.chunks = [];
    }
    decode(line) {
        if (line.endsWith('\r')) {
            line = line.substring(0, line.length - 1);
        }
        if (!line) {
            // empty line and we didn't previously encounter any messages
            if (!this.event && !this.data.length)
                return null;
            const sse = {
                event: this.event,
                data: this.data.join('\n'),
                raw: this.chunks,
            };
            this.event = null;
            this.data = [];
            this.chunks = [];
            return sse;
        }
        this.chunks.push(line);
        if (line.startsWith(':')) {
            return null;
        }
        let [fieldname, _, value] = partition$1(line, ':');
        if (value.startsWith(' ')) {
            value = value.substring(1);
        }
        if (fieldname === 'event') {
            this.event = value;
        }
        else if (fieldname === 'data') {
            this.data.push(value);
        }
        return null;
    }
};
function partition$1(str, delimiter) {
    const index = str.indexOf(delimiter);
    if (index !== -1) {
        return [str.substring(0, index), delimiter, str.substring(index + delimiter.length)];
    }
    return [str, '', ''];
}
/**
 * Most browsers don't yet have async iterable support for ReadableStream,
 * and Node has a very different way of reading bytes from its "ReadableStream".
 *
 * This polyfill was pulled from https://github.com/MattiasBuelens/web-streams-polyfill/pull/122#issuecomment-1627354490
 */
function readableStreamAsyncIterable(stream) {
    if (stream[Symbol.asyncIterator])
        return stream;
    const reader = stream.getReader();
    return {
        async next() {
            try {
                const result = await reader.read();
                if (result?.done)
                    reader.releaseLock(); // release lock when stream becomes closed
                return result;
            }
            catch (e) {
                reader.releaseLock(); // release lock when stream becomes errored
                throw e;
            }
        },
        async return() {
            const cancelPromise = reader.cancel();
            reader.releaseLock();
            await cancelPromise;
            return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
            return this;
        },
    };
}

const isResponseLike$1 = (value) => value != null &&
    typeof value === 'object' &&
    typeof value.url === 'string' &&
    typeof value.blob === 'function';
const isFileLike$1 = (value) => value != null &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    typeof value.lastModified === 'number' &&
    isBlobLike$1(value);
/**
 * The BlobLike type omits arrayBuffer() because @types/node-fetch@^2.6.4 lacks it; but this check
 * adds the arrayBuffer() method type because it is available and used at runtime
 */
const isBlobLike$1 = (value) => value != null &&
    typeof value === 'object' &&
    typeof value.size === 'number' &&
    typeof value.type === 'string' &&
    typeof value.text === 'function' &&
    typeof value.slice === 'function' &&
    typeof value.arrayBuffer === 'function';
/**
 * Helper for creating a {@link File} to pass to an SDK upload method from a variety of different data formats
 * @param value the raw content of the file.  Can be an {@link Uploadable}, {@link BlobLikePart}, or {@link AsyncIterable} of {@link BlobLikePart}s
 * @param {string=} name the name of the file. If omitted, toFile will try to determine a file name from bits if possible
 * @param {Object=} options additional properties
 * @param {string=} options.type the MIME type of the content
 * @param {number=} options.lastModified the last modified timestamp
 * @returns a {@link File} with the given properties
 */
async function toFile$1(value, name, options) {
    // If it's a promise, resolve it.
    value = await value;
    // If we've been given a `File` we don't need to do anything
    if (isFileLike$1(value)) {
        return value;
    }
    if (isResponseLike$1(value)) {
        const blob = await value.blob();
        name || (name = new URL(value.url).pathname.split(/[\\/]/).pop() ?? 'unknown_file');
        // we need to convert the `Blob` into an array buffer because the `Blob` class
        // that `node-fetch` defines is incompatible with the web standard which results
        // in `new File` interpreting it as a string instead of binary data.
        const data = isBlobLike$1(blob) ? [(await blob.arrayBuffer())] : [blob];
        return new File$2(data, name, options);
    }
    const bits = await getBytes$1(value);
    name || (name = getName$1(value) ?? 'unknown_file');
    if (!options?.type) {
        const type = bits[0]?.type;
        if (typeof type === 'string') {
            options = { ...options, type };
        }
    }
    return new File$2(bits, name, options);
}
async function getBytes$1(value) {
    let parts = [];
    if (typeof value === 'string' ||
        ArrayBuffer.isView(value) || // includes Uint8Array, Buffer, etc.
        value instanceof ArrayBuffer) {
        parts.push(value);
    }
    else if (isBlobLike$1(value)) {
        parts.push(await value.arrayBuffer());
    }
    else if (isAsyncIterableIterator$1(value) // includes Readable, ReadableStream, etc.
    ) {
        for await (const chunk of value) {
            parts.push(chunk); // TODO, consider validating?
        }
    }
    else {
        throw new Error(`Unexpected data type: ${typeof value}; constructor: ${value?.constructor
            ?.name}; props: ${propsForError$1(value)}`);
    }
    return parts;
}
function propsForError$1(value) {
    const props = Object.getOwnPropertyNames(value);
    return `[${props.map((p) => `"${p}"`).join(', ')}]`;
}
function getName$1(value) {
    return (getStringFromMaybeBuffer$1(value.name) ||
        getStringFromMaybeBuffer$1(value.filename) ||
        // For fs.ReadStream
        getStringFromMaybeBuffer$1(value.path)?.split(/[\\/]/).pop());
}
const getStringFromMaybeBuffer$1 = (x) => {
    if (typeof x === 'string')
        return x;
    if (typeof Buffer !== 'undefined' && x instanceof Buffer)
        return String(x);
    return undefined;
};
const isAsyncIterableIterator$1 = (value) => value != null && typeof value === 'object' && typeof value[Symbol.asyncIterator] === 'function';
const isMultipartBody$1 = (body) => body && typeof body === 'object' && body.body && body[Symbol.toStringTag] === 'MultipartBody';

var __classPrivateFieldSet$6 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$7 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _AbstractPage_client$1;
async function defaultParseResponse$1(props) {
    const { response } = props;
    if (props.options.stream) {
        debug$1('response', response.status, response.url, response.headers, response.body);
        // Note: there is an invariant here that isn't represented in the type system
        // that if you set `stream: true` the response type must also be `Stream<T>`
        if (props.options.__streamClass) {
            return props.options.__streamClass.fromSSEResponse(response, props.controller);
        }
        return Stream$1.fromSSEResponse(response, props.controller);
    }
    // fetch refuses to read the body when the status code is 204.
    if (response.status === 204) {
        return null;
    }
    if (props.options.__binaryResponse) {
        return response;
    }
    const contentType = response.headers.get('content-type');
    const isJSON = contentType?.includes('application/json') || contentType?.includes('application/vnd.api+json');
    if (isJSON) {
        const json = await response.json();
        debug$1('response', response.status, response.url, response.headers, json);
        return _addRequestID$1(json, response);
    }
    const text = await response.text();
    debug$1('response', response.status, response.url, response.headers, text);
    // TODO handle blob, arraybuffer, other content types, etc.
    return text;
}
function _addRequestID$1(value, response) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }
    return Object.defineProperty(value, '_request_id', {
        value: response.headers.get('request-id'),
        enumerable: false,
    });
}
/**
 * A subclass of `Promise` providing additional helper methods
 * for interacting with the SDK.
 */
let APIPromise$1 = class APIPromise extends Promise {
    constructor(responsePromise, parseResponse = defaultParseResponse$1) {
        super((resolve) => {
            // this is maybe a bit weird but this has to be a no-op to not implicitly
            // parse the response body; instead .then, .catch, .finally are overridden
            // to parse the response
            resolve(null);
        });
        this.responsePromise = responsePromise;
        this.parseResponse = parseResponse;
    }
    _thenUnwrap(transform) {
        return new APIPromise(this.responsePromise, async (props) => _addRequestID$1(transform(await this.parseResponse(props), props), props.response));
    }
    /**
     * Gets the raw `Response` instance instead of parsing the response
     * data.
     *
     * If you want to parse the response body but still get the `Response`
     * instance, you can use {@link withResponse()}.
     *
     * 👋 Getting the wrong TypeScript type for `Response`?
     * Try setting `"moduleResolution": "NodeNext"` if you can,
     * or add one of these imports before your first `import … from '@anthropic-ai/sdk'`:
     * - `import '@anthropic-ai/sdk/shims/node'` (if you're running on Node)
     * - `import '@anthropic-ai/sdk/shims/web'` (otherwise)
     */
    asResponse() {
        return this.responsePromise.then((p) => p.response);
    }
    /**
     * Gets the parsed response data, the raw `Response` instance and the ID of the request,
     * returned vie the `request-id` header which is useful for debugging requests and resporting
     * issues to Anthropic.
     *
     * If you just want to get the raw `Response` instance without parsing it,
     * you can use {@link asResponse()}.
     *
     * 👋 Getting the wrong TypeScript type for `Response`?
     * Try setting `"moduleResolution": "NodeNext"` if you can,
     * or add one of these imports before your first `import … from '@anthropic-ai/sdk'`:
     * - `import '@anthropic-ai/sdk/shims/node'` (if you're running on Node)
     * - `import '@anthropic-ai/sdk/shims/web'` (otherwise)
     */
    async withResponse() {
        const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
        return { data, response, request_id: response.headers.get('request-id') };
    }
    parse() {
        if (!this.parsedPromise) {
            this.parsedPromise = this.responsePromise.then(this.parseResponse);
        }
        return this.parsedPromise;
    }
    then(onfulfilled, onrejected) {
        return this.parse().then(onfulfilled, onrejected);
    }
    catch(onrejected) {
        return this.parse().catch(onrejected);
    }
    finally(onfinally) {
        return this.parse().finally(onfinally);
    }
};
let APIClient$1 = class APIClient {
    constructor({ baseURL, maxRetries = 2, timeout = 600000, // 10 minutes
    httpAgent, fetch: overriddenFetch, }) {
        this.baseURL = baseURL;
        this.maxRetries = validatePositiveInteger$1('maxRetries', maxRetries);
        this.timeout = validatePositiveInteger$1('timeout', timeout);
        this.httpAgent = httpAgent;
        this.fetch = overriddenFetch ?? fetch$2;
    }
    authHeaders(opts) {
        return {};
    }
    /**
     * Override this to add your own default headers, for example:
     *
     *  {
     *    ...super.defaultHeaders(),
     *    Authorization: 'Bearer 123',
     *  }
     */
    defaultHeaders(opts) {
        return {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': this.getUserAgent(),
            ...getPlatformHeaders$1(),
            ...this.authHeaders(opts),
        };
    }
    /**
     * Override this to add your own headers validation:
     */
    validateHeaders(headers, customHeaders) { }
    defaultIdempotencyKey() {
        return `stainless-node-retry-${uuid4$1()}`;
    }
    get(path, opts) {
        return this.methodRequest('get', path, opts);
    }
    post(path, opts) {
        return this.methodRequest('post', path, opts);
    }
    patch(path, opts) {
        return this.methodRequest('patch', path, opts);
    }
    put(path, opts) {
        return this.methodRequest('put', path, opts);
    }
    delete(path, opts) {
        return this.methodRequest('delete', path, opts);
    }
    methodRequest(method, path, opts) {
        return this.request(Promise.resolve(opts).then(async (opts) => {
            const body = opts && isBlobLike$1(opts?.body) ? new DataView(await opts.body.arrayBuffer())
                : opts?.body instanceof DataView ? opts.body
                    : opts?.body instanceof ArrayBuffer ? new DataView(opts.body)
                        : opts && ArrayBuffer.isView(opts?.body) ? new DataView(opts.body.buffer)
                            : opts?.body;
            return { method, path, ...opts, body };
        }));
    }
    getAPIList(path, Page, opts) {
        return this.requestAPIList(Page, { method: 'get', path, ...opts });
    }
    calculateContentLength(body) {
        if (typeof body === 'string') {
            if (typeof Buffer !== 'undefined') {
                return Buffer.byteLength(body, 'utf8').toString();
            }
            if (typeof TextEncoder !== 'undefined') {
                const encoder = new TextEncoder();
                const encoded = encoder.encode(body);
                return encoded.length.toString();
            }
        }
        else if (ArrayBuffer.isView(body)) {
            return body.byteLength.toString();
        }
        return null;
    }
    buildRequest(options, { retryCount = 0 } = {}) {
        const { method, path, query, headers: headers = {} } = options;
        const body = ArrayBuffer.isView(options.body) || (options.__binaryRequest && typeof options.body === 'string') ?
            options.body
            : isMultipartBody$1(options.body) ? options.body.body
                : options.body ? JSON.stringify(options.body, null, 2)
                    : null;
        const contentLength = this.calculateContentLength(body);
        const url = this.buildURL(path, query);
        if ('timeout' in options)
            validatePositiveInteger$1('timeout', options.timeout);
        const timeout = options.timeout ?? this.timeout;
        const httpAgent = options.httpAgent ?? this.httpAgent ?? getDefaultAgent$1(url);
        const minAgentTimeout = timeout + 1000;
        if (typeof httpAgent?.options?.timeout === 'number' &&
            minAgentTimeout > (httpAgent.options.timeout ?? 0)) {
            // Allow any given request to bump our agent active socket timeout.
            // This may seem strange, but leaking active sockets should be rare and not particularly problematic,
            // and without mutating agent we would need to create more of them.
            // This tradeoff optimizes for performance.
            httpAgent.options.timeout = minAgentTimeout;
        }
        if (this.idempotencyHeader && method !== 'get') {
            if (!options.idempotencyKey)
                options.idempotencyKey = this.defaultIdempotencyKey();
            headers[this.idempotencyHeader] = options.idempotencyKey;
        }
        const reqHeaders = this.buildHeaders({ options, headers, contentLength, retryCount });
        const req = {
            method,
            ...(body && { body: body }),
            headers: reqHeaders,
            ...(httpAgent && { agent: httpAgent }),
            // @ts-ignore node-fetch uses a custom AbortSignal type that is
            // not compatible with standard web types
            signal: options.signal ?? null,
        };
        return { req, url, timeout };
    }
    buildHeaders({ options, headers, contentLength, retryCount, }) {
        const reqHeaders = {};
        if (contentLength) {
            reqHeaders['content-length'] = contentLength;
        }
        const defaultHeaders = this.defaultHeaders(options);
        applyHeadersMut$1(reqHeaders, defaultHeaders);
        applyHeadersMut$1(reqHeaders, headers);
        // let builtin fetch set the Content-Type for multipart bodies
        if (isMultipartBody$1(options.body) && kind$1 !== 'node') {
            delete reqHeaders['content-type'];
        }
        // Don't set the retry count header if it was already set or removed through default headers or by the
        // caller. We check `defaultHeaders` and `headers`, which can contain nulls, instead of `reqHeaders` to
        // account for the removal case.
        if (getHeader$1(defaultHeaders, 'x-stainless-retry-count') === undefined &&
            getHeader$1(headers, 'x-stainless-retry-count') === undefined) {
            reqHeaders['x-stainless-retry-count'] = String(retryCount);
        }
        this.validateHeaders(reqHeaders, headers);
        return reqHeaders;
    }
    /**
     * Used as a callback for mutating the given `FinalRequestOptions` object.
     */
    async prepareOptions(options) { }
    /**
     * Used as a callback for mutating the given `RequestInit` object.
     *
     * This is useful for cases where you want to add certain headers based off of
     * the request properties, e.g. `method` or `url`.
     */
    async prepareRequest(request, { url, options }) { }
    parseHeaders(headers) {
        return (!headers ? {}
            : Symbol.iterator in headers ?
                Object.fromEntries(Array.from(headers).map((header) => [...header]))
                : { ...headers });
    }
    makeStatusError(status, error, message, headers) {
        return APIError$1.generate(status, error, message, headers);
    }
    request(options, remainingRetries = null) {
        return new APIPromise$1(this.makeRequest(options, remainingRetries));
    }
    async makeRequest(optionsInput, retriesRemaining) {
        const options = await optionsInput;
        const maxRetries = options.maxRetries ?? this.maxRetries;
        if (retriesRemaining == null) {
            retriesRemaining = maxRetries;
        }
        await this.prepareOptions(options);
        const { req, url, timeout } = this.buildRequest(options, { retryCount: maxRetries - retriesRemaining });
        await this.prepareRequest(req, { url, options });
        debug$1('request', url, options, req.headers);
        if (options.signal?.aborted) {
            throw new APIUserAbortError$1();
        }
        const controller = new AbortController();
        const response = await this.fetchWithTimeout(url, req, timeout, controller).catch(castToError$1);
        if (response instanceof Error) {
            if (options.signal?.aborted) {
                throw new APIUserAbortError$1();
            }
            if (retriesRemaining) {
                return this.retryRequest(options, retriesRemaining);
            }
            if (response.name === 'AbortError') {
                throw new APIConnectionTimeoutError$1();
            }
            throw new APIConnectionError$1({ cause: response });
        }
        const responseHeaders = createResponseHeaders$1(response.headers);
        if (!response.ok) {
            if (retriesRemaining && this.shouldRetry(response)) {
                const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
                debug$1(`response (error; ${retryMessage})`, response.status, url, responseHeaders);
                return this.retryRequest(options, retriesRemaining, responseHeaders);
            }
            const errText = await response.text().catch((e) => castToError$1(e).message);
            const errJSON = safeJSON$1(errText);
            const errMessage = errJSON ? undefined : errText;
            const retryMessage = retriesRemaining ? `(error; no more retries left)` : `(error; not retryable)`;
            debug$1(`response (error; ${retryMessage})`, response.status, url, responseHeaders, errMessage);
            const err = this.makeStatusError(response.status, errJSON, errMessage, responseHeaders);
            throw err;
        }
        return { response, options, controller };
    }
    requestAPIList(Page, options) {
        const request = this.makeRequest(options, null);
        return new PagePromise$1(this, request, Page);
    }
    buildURL(path, query) {
        const url = isAbsoluteURL$1(path) ?
            new URL(path)
            : new URL(this.baseURL + (this.baseURL.endsWith('/') && path.startsWith('/') ? path.slice(1) : path));
        const defaultQuery = this.defaultQuery();
        if (!isEmptyObj$1(defaultQuery)) {
            query = { ...defaultQuery, ...query };
        }
        if (typeof query === 'object' && query && !Array.isArray(query)) {
            url.search = this.stringifyQuery(query);
        }
        return url.toString();
    }
    stringifyQuery(query) {
        return Object.entries(query)
            .filter(([_, value]) => typeof value !== 'undefined')
            .map(([key, value]) => {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            }
            if (value === null) {
                return `${encodeURIComponent(key)}=`;
            }
            throw new AnthropicError(`Cannot stringify type ${typeof value}; Expected string, number, boolean, or null. If you need to pass nested query parameters, you can manually encode them, e.g. { query: { 'foo[key1]': value1, 'foo[key2]': value2 } }, and please open a GitHub issue requesting better support for your use case.`);
        })
            .join('&');
    }
    async fetchWithTimeout(url, init, ms, controller) {
        const { signal, ...options } = init || {};
        if (signal)
            signal.addEventListener('abort', () => controller.abort());
        const timeout = setTimeout(() => controller.abort(), ms);
        return (
        // use undefined this binding; fetch errors if bound to something else in browser/cloudflare
        this.fetch.call(undefined, url, { signal: controller.signal, ...options }).finally(() => {
            clearTimeout(timeout);
        }));
    }
    shouldRetry(response) {
        // Note this is not a standard header.
        const shouldRetryHeader = response.headers.get('x-should-retry');
        // If the server explicitly says whether or not to retry, obey.
        if (shouldRetryHeader === 'true')
            return true;
        if (shouldRetryHeader === 'false')
            return false;
        // Retry on request timeouts.
        if (response.status === 408)
            return true;
        // Retry on lock timeouts.
        if (response.status === 409)
            return true;
        // Retry on rate limits.
        if (response.status === 429)
            return true;
        // Retry internal errors.
        if (response.status >= 500)
            return true;
        return false;
    }
    async retryRequest(options, retriesRemaining, responseHeaders) {
        let timeoutMillis;
        // Note the `retry-after-ms` header may not be standard, but is a good idea and we'd like proactive support for it.
        const retryAfterMillisHeader = responseHeaders?.['retry-after-ms'];
        if (retryAfterMillisHeader) {
            const timeoutMs = parseFloat(retryAfterMillisHeader);
            if (!Number.isNaN(timeoutMs)) {
                timeoutMillis = timeoutMs;
            }
        }
        // About the Retry-After header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
        const retryAfterHeader = responseHeaders?.['retry-after'];
        if (retryAfterHeader && !timeoutMillis) {
            const timeoutSeconds = parseFloat(retryAfterHeader);
            if (!Number.isNaN(timeoutSeconds)) {
                timeoutMillis = timeoutSeconds * 1000;
            }
            else {
                timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
            }
        }
        // If the API asks us to wait a certain amount of time (and it's a reasonable amount),
        // just do what it says, but otherwise calculate a default
        if (!(timeoutMillis && 0 <= timeoutMillis && timeoutMillis < 60 * 1000)) {
            const maxRetries = options.maxRetries ?? this.maxRetries;
            timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
        }
        await sleep$1(timeoutMillis);
        return this.makeRequest(options, retriesRemaining - 1);
    }
    calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
        const initialRetryDelay = 0.5;
        const maxRetryDelay = 8.0;
        const numRetries = maxRetries - retriesRemaining;
        // Apply exponential backoff, but not more than the max.
        const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
        // Apply some jitter, take up to at most 25 percent of the retry time.
        const jitter = 1 - Math.random() * 0.25;
        return sleepSeconds * jitter * 1000;
    }
    getUserAgent() {
        return `${this.constructor.name}/JS ${VERSION$1}`;
    }
};
let AbstractPage$1 = class AbstractPage {
    constructor(client, response, body, options) {
        _AbstractPage_client$1.set(this, void 0);
        __classPrivateFieldSet$6(this, _AbstractPage_client$1, client, "f");
        this.options = options;
        this.response = response;
        this.body = body;
    }
    hasNextPage() {
        const items = this.getPaginatedItems();
        if (!items.length)
            return false;
        return this.nextPageInfo() != null;
    }
    async getNextPage() {
        const nextInfo = this.nextPageInfo();
        if (!nextInfo) {
            throw new AnthropicError('No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.');
        }
        const nextOptions = { ...this.options };
        if ('params' in nextInfo && typeof nextOptions.query === 'object') {
            nextOptions.query = { ...nextOptions.query, ...nextInfo.params };
        }
        else if ('url' in nextInfo) {
            const params = [...Object.entries(nextOptions.query || {}), ...nextInfo.url.searchParams.entries()];
            for (const [key, value] of params) {
                nextInfo.url.searchParams.set(key, value);
            }
            nextOptions.query = undefined;
            nextOptions.path = nextInfo.url.toString();
        }
        return await __classPrivateFieldGet$7(this, _AbstractPage_client$1, "f").requestAPIList(this.constructor, nextOptions);
    }
    async *iterPages() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let page = this;
        yield page;
        while (page.hasNextPage()) {
            page = await page.getNextPage();
            yield page;
        }
    }
    async *[(_AbstractPage_client$1 = new WeakMap(), Symbol.asyncIterator)]() {
        for await (const page of this.iterPages()) {
            for (const item of page.getPaginatedItems()) {
                yield item;
            }
        }
    }
};
/**
 * This subclass of Promise will resolve to an instantiated Page once the request completes.
 *
 * It also implements AsyncIterable to allow auto-paginating iteration on an unawaited list call, eg:
 *
 *    for await (const item of client.items.list()) {
 *      console.log(item)
 *    }
 */
let PagePromise$1 = class PagePromise extends APIPromise$1 {
    constructor(client, request, Page) {
        super(request, async (props) => new Page(client, props.response, await defaultParseResponse$1(props), props.options));
    }
    /**
     * Allow auto-paginating iteration on an unawaited list call, eg:
     *
     *    for await (const item of client.items.list()) {
     *      console.log(item)
     *    }
     */
    async *[Symbol.asyncIterator]() {
        const page = await this;
        for await (const item of page) {
            yield item;
        }
    }
};
const createResponseHeaders$1 = (headers) => {
    return new Proxy(Object.fromEntries(
    // @ts-ignore
    headers.entries()), {
        get(target, name) {
            const key = name.toString();
            return target[key.toLowerCase()] || target[key];
        },
    });
};
// This is required so that we can determine if a given object matches the RequestOptions
// type at runtime. While this requires duplication, it is enforced by the TypeScript
// compiler such that any missing / extraneous keys will cause an error.
const requestOptionsKeys$1 = {
    method: true,
    path: true,
    query: true,
    body: true,
    headers: true,
    maxRetries: true,
    stream: true,
    timeout: true,
    httpAgent: true,
    signal: true,
    idempotencyKey: true,
    __binaryRequest: true,
    __binaryResponse: true,
    __streamClass: true,
};
const isRequestOptions$1 = (obj) => {
    return (typeof obj === 'object' &&
        obj !== null &&
        !isEmptyObj$1(obj) &&
        Object.keys(obj).every((k) => hasOwn$1(requestOptionsKeys$1, k)));
};
const getPlatformProperties$1 = () => {
    if (typeof Deno !== 'undefined' && Deno.build != null) {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION$1,
            'X-Stainless-OS': normalizePlatform$1(Deno.build.os),
            'X-Stainless-Arch': normalizeArch$1(Deno.build.arch),
            'X-Stainless-Runtime': 'deno',
            'X-Stainless-Runtime-Version': typeof Deno.version === 'string' ? Deno.version : Deno.version?.deno ?? 'unknown',
        };
    }
    if (typeof EdgeRuntime !== 'undefined') {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION$1,
            'X-Stainless-OS': 'Unknown',
            'X-Stainless-Arch': `other:${EdgeRuntime}`,
            'X-Stainless-Runtime': 'edge',
            'X-Stainless-Runtime-Version': process.version,
        };
    }
    // Check if Node.js
    if (Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]') {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION$1,
            'X-Stainless-OS': normalizePlatform$1(process.platform),
            'X-Stainless-Arch': normalizeArch$1(process.arch),
            'X-Stainless-Runtime': 'node',
            'X-Stainless-Runtime-Version': process.version,
        };
    }
    const browserInfo = getBrowserInfo$1();
    if (browserInfo) {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION$1,
            'X-Stainless-OS': 'Unknown',
            'X-Stainless-Arch': 'unknown',
            'X-Stainless-Runtime': `browser:${browserInfo.browser}`,
            'X-Stainless-Runtime-Version': browserInfo.version,
        };
    }
    // TODO add support for Cloudflare workers, etc.
    return {
        'X-Stainless-Lang': 'js',
        'X-Stainless-Package-Version': VERSION$1,
        'X-Stainless-OS': 'Unknown',
        'X-Stainless-Arch': 'unknown',
        'X-Stainless-Runtime': 'unknown',
        'X-Stainless-Runtime-Version': 'unknown',
    };
};
// Note: modified from https://github.com/JS-DevTools/host-environment/blob/b1ab79ecde37db5d6e163c050e54fe7d287d7c92/src/isomorphic.browser.ts
function getBrowserInfo$1() {
    if (typeof navigator === 'undefined' || !navigator) {
        return null;
    }
    // NOTE: The order matters here!
    const browserPatterns = [
        { key: 'edge', pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'ie', pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'ie', pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'chrome', pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'firefox', pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'safari', pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ },
    ];
    // Find the FIRST matching browser
    for (const { key, pattern } of browserPatterns) {
        const match = pattern.exec(navigator.userAgent);
        if (match) {
            const major = match[1] || 0;
            const minor = match[2] || 0;
            const patch = match[3] || 0;
            return { browser: key, version: `${major}.${minor}.${patch}` };
        }
    }
    return null;
}
const normalizeArch$1 = (arch) => {
    // Node docs:
    // - https://nodejs.org/api/process.html#processarch
    // Deno docs:
    // - https://doc.deno.land/deno/stable/~/Deno.build
    if (arch === 'x32')
        return 'x32';
    if (arch === 'x86_64' || arch === 'x64')
        return 'x64';
    if (arch === 'arm')
        return 'arm';
    if (arch === 'aarch64' || arch === 'arm64')
        return 'arm64';
    if (arch)
        return `other:${arch}`;
    return 'unknown';
};
const normalizePlatform$1 = (platform) => {
    // Node platforms:
    // - https://nodejs.org/api/process.html#processplatform
    // Deno platforms:
    // - https://doc.deno.land/deno/stable/~/Deno.build
    // - https://github.com/denoland/deno/issues/14799
    platform = platform.toLowerCase();
    // NOTE: this iOS check is untested and may not work
    // Node does not work natively on IOS, there is a fork at
    // https://github.com/nodejs-mobile/nodejs-mobile
    // however it is unknown at the time of writing how to detect if it is running
    if (platform.includes('ios'))
        return 'iOS';
    if (platform === 'android')
        return 'Android';
    if (platform === 'darwin')
        return 'MacOS';
    if (platform === 'win32')
        return 'Windows';
    if (platform === 'freebsd')
        return 'FreeBSD';
    if (platform === 'openbsd')
        return 'OpenBSD';
    if (platform === 'linux')
        return 'Linux';
    if (platform)
        return `Other:${platform}`;
    return 'Unknown';
};
let _platformHeaders$1;
const getPlatformHeaders$1 = () => {
    return (_platformHeaders$1 ?? (_platformHeaders$1 = getPlatformProperties$1()));
};
const safeJSON$1 = (text) => {
    try {
        return JSON.parse(text);
    }
    catch (err) {
        return undefined;
    }
};
// https://url.spec.whatwg.org/#url-scheme-string
const startsWithSchemeRegexp$1 = /^[a-z][a-z0-9+.-]*:/i;
const isAbsoluteURL$1 = (url) => {
    return startsWithSchemeRegexp$1.test(url);
};
const sleep$1 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validatePositiveInteger$1 = (name, n) => {
    if (typeof n !== 'number' || !Number.isInteger(n)) {
        throw new AnthropicError(`${name} must be an integer`);
    }
    if (n < 0) {
        throw new AnthropicError(`${name} must be a positive integer`);
    }
    return n;
};
const castToError$1 = (err) => {
    if (err instanceof Error)
        return err;
    if (typeof err === 'object' && err !== null) {
        try {
            return new Error(JSON.stringify(err));
        }
        catch { }
    }
    return new Error(String(err));
};
/**
 * Read an environment variable.
 *
 * Trims beginning and trailing whitespace.
 *
 * Will return undefined if the environment variable doesn't exist or cannot be accessed.
 */
const readEnv$1 = (env) => {
    if (typeof process !== 'undefined') {
        return process.env?.[env]?.trim() ?? undefined;
    }
    if (typeof Deno !== 'undefined') {
        return Deno.env?.get?.(env)?.trim();
    }
    return undefined;
};
// https://stackoverflow.com/a/34491287
function isEmptyObj$1(obj) {
    if (!obj)
        return true;
    for (const _k in obj)
        return false;
    return true;
}
// https://eslint.org/docs/latest/rules/no-prototype-builtins
function hasOwn$1(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
/**
 * Copies headers from "newHeaders" onto "targetHeaders",
 * using lower-case for all properties,
 * ignoring any keys with undefined values,
 * and deleting any keys with null values.
 */
function applyHeadersMut$1(targetHeaders, newHeaders) {
    for (const k in newHeaders) {
        if (!hasOwn$1(newHeaders, k))
            continue;
        const lowerKey = k.toLowerCase();
        if (!lowerKey)
            continue;
        const val = newHeaders[k];
        if (val === null) {
            delete targetHeaders[lowerKey];
        }
        else if (val !== undefined) {
            targetHeaders[lowerKey] = val;
        }
    }
}
function debug$1(action, ...args) {
    if (typeof process !== 'undefined' && process?.env?.['DEBUG'] === 'true') {
        console.log(`Anthropic:DEBUG:${action}`, ...args);
    }
}
/**
 * https://stackoverflow.com/a/2117523
 */
const uuid4$1 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};
const isRunningInBrowser$1 = () => {
    return (
    // @ts-ignore
    typeof window !== 'undefined' &&
        // @ts-ignore
        typeof window.document !== 'undefined' &&
        // @ts-ignore
        typeof navigator !== 'undefined');
};
const isHeadersProtocol$1 = (headers) => {
    return typeof headers?.get === 'function';
};
const getHeader$1 = (headers, header) => {
    const lowerCasedHeader = header.toLowerCase();
    if (isHeadersProtocol$1(headers)) {
        // to deal with the case where the header looks like Stainless-Event-Id
        const intercapsHeader = header[0]?.toUpperCase() +
            header.substring(1).replace(/([^\w])(\w)/g, (_m, g1, g2) => g1 + g2.toUpperCase());
        for (const key of [header, lowerCasedHeader, header.toUpperCase(), intercapsHeader]) {
            const value = headers.get(key);
            if (value) {
                return value;
            }
        }
    }
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerCasedHeader) {
            if (Array.isArray(value)) {
                if (value.length <= 1)
                    return value[0];
                console.warn(`Received ${value.length} entries for the ${header} header, using the first entry.`);
                return value[0];
            }
            return value;
        }
    }
    return undefined;
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Page$1 = class Page extends AbstractPage$1 {
    constructor(client, response, body, options) {
        super(client, response, body, options);
        this.data = body.data || [];
        this.has_more = body.has_more || false;
        this.first_id = body.first_id || null;
        this.last_id = body.last_id || null;
    }
    getPaginatedItems() {
        return this.data ?? [];
    }
    // @deprecated Please use `nextPageInfo()` instead
    nextPageParams() {
        const info = this.nextPageInfo();
        if (!info)
            return null;
        if ('params' in info)
            return info.params;
        const params = Object.fromEntries(info.url.searchParams);
        if (!Object.keys(params).length)
            return null;
        return params;
    }
    nextPageInfo() {
        if (this.options.query?.['before_id']) {
            // in reverse
            const firstId = this.first_id;
            if (!firstId) {
                return null;
            }
            return {
                params: {
                    before_id: firstId,
                },
            };
        }
        const cursor = this.last_id;
        if (!cursor) {
            return null;
        }
        return {
            params: {
                after_id: cursor,
            },
        };
    }
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let APIResource$1 = class APIResource {
    constructor(client) {
        this._client = client;
    }
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Models$2 = class Models extends APIResource$1 {
    /**
     * Get a specific model.
     *
     * The Models API response can be used to determine information about a specific
     * model or resolve a model alias to a model ID.
     */
    retrieve(modelId, options) {
        return this._client.get(`/v1/models/${modelId}?beta=true`, options);
    }
    list(query = {}, options) {
        if (isRequestOptions$1(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/v1/models?beta=true', BetaModelInfosPage, { query, ...options });
    }
};
class BetaModelInfosPage extends Page$1 {
}
Models$2.BetaModelInfosPage = BetaModelInfosPage;

class JSONLDecoder {
    constructor(iterator, controller) {
        this.iterator = iterator;
        this.controller = controller;
    }
    async *decoder() {
        const lineDecoder = new LineDecoder$1();
        for await (const chunk of this.iterator) {
            for (const line of lineDecoder.decode(chunk)) {
                yield JSON.parse(line);
            }
        }
        for (const line of lineDecoder.flush()) {
            yield JSON.parse(line);
        }
    }
    [Symbol.asyncIterator]() {
        return this.decoder();
    }
    static fromResponse(response, controller) {
        if (!response.body) {
            controller.abort();
            throw new AnthropicError(`Attempted to iterate over a response with no body`);
        }
        return new JSONLDecoder(readableStreamAsyncIterable(response.body), controller);
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Batches$2 = class Batches extends APIResource$1 {
    /**
     * Send a batch of Message creation requests.
     *
     * The Message Batches API can be used to process multiple Messages API requests at
     * once. Once a Message Batch is created, it begins processing immediately. Batches
     * can take up to 24 hours to complete.
     */
    create(params, options) {
        const { betas, ...body } = params;
        return this._client.post('/v1/messages/batches?beta=true', {
            body,
            ...options,
            headers: {
                'anthropic-beta': [...(betas ?? []), 'message-batches-2024-09-24'].toString(),
                ...options?.headers,
            },
        });
    }
    retrieve(messageBatchId, params = {}, options) {
        if (isRequestOptions$1(params)) {
            return this.retrieve(messageBatchId, {}, params);
        }
        const { betas } = params;
        return this._client.get(`/v1/messages/batches/${messageBatchId}?beta=true`, {
            ...options,
            headers: {
                'anthropic-beta': [...(betas ?? []), 'message-batches-2024-09-24'].toString(),
                ...options?.headers,
            },
        });
    }
    list(params = {}, options) {
        if (isRequestOptions$1(params)) {
            return this.list({}, params);
        }
        const { betas, ...query } = params;
        return this._client.getAPIList('/v1/messages/batches?beta=true', BetaMessageBatchesPage, {
            query,
            ...options,
            headers: {
                'anthropic-beta': [...(betas ?? []), 'message-batches-2024-09-24'].toString(),
                ...options?.headers,
            },
        });
    }
    cancel(messageBatchId, params = {}, options) {
        if (isRequestOptions$1(params)) {
            return this.cancel(messageBatchId, {}, params);
        }
        const { betas } = params;
        return this._client.post(`/v1/messages/batches/${messageBatchId}/cancel?beta=true`, {
            ...options,
            headers: {
                'anthropic-beta': [...(betas ?? []), 'message-batches-2024-09-24'].toString(),
                ...options?.headers,
            },
        });
    }
    async results(messageBatchId, params = {}, options) {
        if (isRequestOptions$1(params)) {
            return this.results(messageBatchId, {}, params);
        }
        const batch = await this.retrieve(messageBatchId);
        if (!batch.results_url) {
            throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
        }
        const { betas } = params;
        return this._client
            .get(batch.results_url, {
            ...options,
            headers: {
                'anthropic-beta': [...(betas ?? []), 'message-batches-2024-09-24'].toString(),
                ...options?.headers,
            },
            __binaryResponse: true,
        })
            ._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
    }
};
class BetaMessageBatchesPage extends Page$1 {
}
Batches$2.BetaMessageBatchesPage = BetaMessageBatchesPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Messages$3 = class Messages extends APIResource$1 {
    constructor() {
        super(...arguments);
        this.batches = new Batches$2(this._client);
    }
    create(params, options) {
        const { betas, ...body } = params;
        return this._client.post('/v1/messages?beta=true', {
            body,
            timeout: this._client._options.timeout ?? 600000,
            ...options,
            headers: {
                ...(betas?.toString() != null ? { 'anthropic-beta': betas?.toString() } : undefined),
                ...options?.headers,
            },
            stream: params.stream ?? false,
        });
    }
    /**
     * Count the number of tokens in a Message.
     *
     * The Token Count API can be used to count the number of tokens in a Message,
     * including tools, images, and documents, without creating it.
     */
    countTokens(params, options) {
        const { betas, ...body } = params;
        return this._client.post('/v1/messages/count_tokens?beta=true', {
            body,
            ...options,
            headers: {
                'anthropic-beta': [...(betas ?? []), 'token-counting-2024-11-01'].toString(),
                ...options?.headers,
            },
        });
    }
};
Messages$3.Batches = Batches$2;
Messages$3.BetaMessageBatchesPage = BetaMessageBatchesPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Beta$1 = class Beta extends APIResource$1 {
    constructor() {
        super(...arguments);
        this.models = new Models$2(this._client);
        this.messages = new Messages$3(this._client);
    }
};
Beta$1.Models = Models$2;
Beta$1.BetaModelInfosPage = BetaModelInfosPage;
Beta$1.Messages = Messages$3;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Completions$3 = class Completions extends APIResource$1 {
    create(body, options) {
        return this._client.post('/v1/complete', {
            body,
            timeout: this._client._options.timeout ?? 600000,
            ...options,
            stream: body.stream ?? false,
        });
    }
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Batches$1 = class Batches extends APIResource$1 {
    /**
     * Send a batch of Message creation requests.
     *
     * The Message Batches API can be used to process multiple Messages API requests at
     * once. Once a Message Batch is created, it begins processing immediately. Batches
     * can take up to 24 hours to complete.
     */
    create(body, options) {
        return this._client.post('/v1/messages/batches', { body, ...options });
    }
    /**
     * This endpoint is idempotent and can be used to poll for Message Batch
     * completion. To access the results of a Message Batch, make a request to the
     * `results_url` field in the response.
     */
    retrieve(messageBatchId, options) {
        return this._client.get(`/v1/messages/batches/${messageBatchId}`, options);
    }
    list(query = {}, options) {
        if (isRequestOptions$1(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/v1/messages/batches', MessageBatchesPage, { query, ...options });
    }
    /**
     * Batches may be canceled any time before processing ends. Once cancellation is
     * initiated, the batch enters a `canceling` state, at which time the system may
     * complete any in-progress, non-interruptible requests before finalizing
     * cancellation.
     *
     * The number of canceled requests is specified in `request_counts`. To determine
     * which requests were canceled, check the individual results within the batch.
     * Note that cancellation may not result in any canceled requests if they were
     * non-interruptible.
     */
    cancel(messageBatchId, options) {
        return this._client.post(`/v1/messages/batches/${messageBatchId}/cancel`, options);
    }
    /**
     * Streams the results of a Message Batch as a `.jsonl` file.
     *
     * Each line in the file is a JSON object containing the result of a single request
     * in the Message Batch. Results are not guaranteed to be in the same order as
     * requests. Use the `custom_id` field to match results to requests.
     */
    async results(messageBatchId, options) {
        const batch = await this.retrieve(messageBatchId);
        if (!batch.results_url) {
            throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
        }
        return this._client
            .get(batch.results_url, { ...options, __binaryResponse: true })
            ._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
    }
};
class MessageBatchesPage extends Page$1 {
}
Batches$1.MessageBatchesPage = MessageBatchesPage;

const tokenize = (input) => {
    let current = 0;
    let tokens = [];
    while (current < input.length) {
        let char = input[current];
        if (char === '\\') {
            current++;
            continue;
        }
        if (char === '{') {
            tokens.push({
                type: 'brace',
                value: '{',
            });
            current++;
            continue;
        }
        if (char === '}') {
            tokens.push({
                type: 'brace',
                value: '}',
            });
            current++;
            continue;
        }
        if (char === '[') {
            tokens.push({
                type: 'paren',
                value: '[',
            });
            current++;
            continue;
        }
        if (char === ']') {
            tokens.push({
                type: 'paren',
                value: ']',
            });
            current++;
            continue;
        }
        if (char === ':') {
            tokens.push({
                type: 'separator',
                value: ':',
            });
            current++;
            continue;
        }
        if (char === ',') {
            tokens.push({
                type: 'delimiter',
                value: ',',
            });
            current++;
            continue;
        }
        if (char === '"') {
            let value = '';
            let danglingQuote = false;
            char = input[++current];
            while (char !== '"') {
                if (current === input.length) {
                    danglingQuote = true;
                    break;
                }
                if (char === '\\') {
                    current++;
                    if (current === input.length) {
                        danglingQuote = true;
                        break;
                    }
                    value += char + input[current];
                    char = input[++current];
                }
                else {
                    value += char;
                    char = input[++current];
                }
            }
            char = input[++current];
            if (!danglingQuote) {
                tokens.push({
                    type: 'string',
                    value,
                });
            }
            continue;
        }
        let WHITESPACE = /\s/;
        if (char && WHITESPACE.test(char)) {
            current++;
            continue;
        }
        let NUMBERS = /[0-9]/;
        if ((char && NUMBERS.test(char)) || char === '-' || char === '.') {
            let value = '';
            if (char === '-') {
                value += char;
                char = input[++current];
            }
            while ((char && NUMBERS.test(char)) || char === '.') {
                value += char;
                char = input[++current];
            }
            tokens.push({
                type: 'number',
                value,
            });
            continue;
        }
        let LETTERS = /[a-z]/i;
        if (char && LETTERS.test(char)) {
            let value = '';
            while (char && LETTERS.test(char)) {
                if (current === input.length) {
                    break;
                }
                value += char;
                char = input[++current];
            }
            if (value == 'true' || value == 'false' || value === 'null') {
                tokens.push({
                    type: 'name',
                    value,
                });
            }
            else {
                // unknown token, e.g. `nul` which isn't quite `null`
                current++;
                continue;
            }
            continue;
        }
        current++;
    }
    return tokens;
}, strip = (tokens) => {
    if (tokens.length === 0) {
        return tokens;
    }
    let lastToken = tokens[tokens.length - 1];
    switch (lastToken.type) {
        case 'separator':
            tokens = tokens.slice(0, tokens.length - 1);
            return strip(tokens);
        case 'number':
            let lastCharacterOfLastToken = lastToken.value[lastToken.value.length - 1];
            if (lastCharacterOfLastToken === '.' || lastCharacterOfLastToken === '-') {
                tokens = tokens.slice(0, tokens.length - 1);
                return strip(tokens);
            }
        case 'string':
            let tokenBeforeTheLastToken = tokens[tokens.length - 2];
            if (tokenBeforeTheLastToken?.type === 'delimiter') {
                tokens = tokens.slice(0, tokens.length - 1);
                return strip(tokens);
            }
            else if (tokenBeforeTheLastToken?.type === 'brace' && tokenBeforeTheLastToken.value === '{') {
                tokens = tokens.slice(0, tokens.length - 1);
                return strip(tokens);
            }
            break;
        case 'delimiter':
            tokens = tokens.slice(0, tokens.length - 1);
            return strip(tokens);
    }
    return tokens;
}, unstrip = (tokens) => {
    let tail = [];
    tokens.map((token) => {
        if (token.type === 'brace') {
            if (token.value === '{') {
                tail.push('}');
            }
            else {
                tail.splice(tail.lastIndexOf('}'), 1);
            }
        }
        if (token.type === 'paren') {
            if (token.value === '[') {
                tail.push(']');
            }
            else {
                tail.splice(tail.lastIndexOf(']'), 1);
            }
        }
    });
    if (tail.length > 0) {
        tail.reverse().map((item) => {
            if (item === '}') {
                tokens.push({
                    type: 'brace',
                    value: '}',
                });
            }
            else if (item === ']') {
                tokens.push({
                    type: 'paren',
                    value: ']',
                });
            }
        });
    }
    return tokens;
}, generate = (tokens) => {
    let output = '';
    tokens.map((token) => {
        switch (token.type) {
            case 'string':
                output += '"' + token.value + '"';
                break;
            default:
                output += token.value;
                break;
        }
    });
    return output;
}, partialParse$1 = (input) => JSON.parse(generate(unstrip(strip(tokenize(input)))));

var __classPrivateFieldSet$5 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$6 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _MessageStream_instances, _MessageStream_currentMessageSnapshot, _MessageStream_connectedPromise, _MessageStream_resolveConnectedPromise, _MessageStream_rejectConnectedPromise, _MessageStream_endPromise, _MessageStream_resolveEndPromise, _MessageStream_rejectEndPromise, _MessageStream_listeners, _MessageStream_ended, _MessageStream_errored, _MessageStream_aborted, _MessageStream_catchingPromiseCreated, _MessageStream_getFinalMessage, _MessageStream_getFinalText, _MessageStream_handleError, _MessageStream_beginRequest, _MessageStream_addStreamEvent, _MessageStream_endRequest, _MessageStream_accumulateMessage;
const JSON_BUF_PROPERTY = '__json_buf';
class MessageStream {
    constructor() {
        _MessageStream_instances.add(this);
        this.messages = [];
        this.receivedMessages = [];
        _MessageStream_currentMessageSnapshot.set(this, void 0);
        this.controller = new AbortController();
        _MessageStream_connectedPromise.set(this, void 0);
        _MessageStream_resolveConnectedPromise.set(this, () => { });
        _MessageStream_rejectConnectedPromise.set(this, () => { });
        _MessageStream_endPromise.set(this, void 0);
        _MessageStream_resolveEndPromise.set(this, () => { });
        _MessageStream_rejectEndPromise.set(this, () => { });
        _MessageStream_listeners.set(this, {});
        _MessageStream_ended.set(this, false);
        _MessageStream_errored.set(this, false);
        _MessageStream_aborted.set(this, false);
        _MessageStream_catchingPromiseCreated.set(this, false);
        _MessageStream_handleError.set(this, (error) => {
            __classPrivateFieldSet$5(this, _MessageStream_errored, true, "f");
            if (error instanceof Error && error.name === 'AbortError') {
                error = new APIUserAbortError$1();
            }
            if (error instanceof APIUserAbortError$1) {
                __classPrivateFieldSet$5(this, _MessageStream_aborted, true, "f");
                return this._emit('abort', error);
            }
            if (error instanceof AnthropicError) {
                return this._emit('error', error);
            }
            if (error instanceof Error) {
                const anthropicError = new AnthropicError(error.message);
                // @ts-ignore
                anthropicError.cause = error;
                return this._emit('error', anthropicError);
            }
            return this._emit('error', new AnthropicError(String(error)));
        });
        __classPrivateFieldSet$5(this, _MessageStream_connectedPromise, new Promise((resolve, reject) => {
            __classPrivateFieldSet$5(this, _MessageStream_resolveConnectedPromise, resolve, "f");
            __classPrivateFieldSet$5(this, _MessageStream_rejectConnectedPromise, reject, "f");
        }), "f");
        __classPrivateFieldSet$5(this, _MessageStream_endPromise, new Promise((resolve, reject) => {
            __classPrivateFieldSet$5(this, _MessageStream_resolveEndPromise, resolve, "f");
            __classPrivateFieldSet$5(this, _MessageStream_rejectEndPromise, reject, "f");
        }), "f");
        // Don't let these promises cause unhandled rejection errors.
        // we will manually cause an unhandled rejection error later
        // if the user hasn't registered any error listener or called
        // any promise-returning method.
        __classPrivateFieldGet$6(this, _MessageStream_connectedPromise, "f").catch(() => { });
        __classPrivateFieldGet$6(this, _MessageStream_endPromise, "f").catch(() => { });
    }
    /**
     * Intended for use on the frontend, consuming a stream produced with
     * `.toReadableStream()` on the backend.
     *
     * Note that messages sent to the model do not appear in `.on('message')`
     * in this context.
     */
    static fromReadableStream(stream) {
        const runner = new MessageStream();
        runner._run(() => runner._fromReadableStream(stream));
        return runner;
    }
    static createMessage(messages, params, options) {
        const runner = new MessageStream();
        for (const message of params.messages) {
            runner._addMessageParam(message);
        }
        runner._run(() => runner._createMessage(messages, { ...params, stream: true }, { ...options, headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'stream' } }));
        return runner;
    }
    _run(executor) {
        executor().then(() => {
            this._emitFinal();
            this._emit('end');
        }, __classPrivateFieldGet$6(this, _MessageStream_handleError, "f"));
    }
    _addMessageParam(message) {
        this.messages.push(message);
    }
    _addMessage(message, emit = true) {
        this.receivedMessages.push(message);
        if (emit) {
            this._emit('message', message);
        }
    }
    async _createMessage(messages, params, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
        const stream = await messages.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
        this._connected();
        for await (const event of stream) {
            __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError$1();
        }
        __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
    }
    _connected() {
        if (this.ended)
            return;
        __classPrivateFieldGet$6(this, _MessageStream_resolveConnectedPromise, "f").call(this);
        this._emit('connect');
    }
    get ended() {
        return __classPrivateFieldGet$6(this, _MessageStream_ended, "f");
    }
    get errored() {
        return __classPrivateFieldGet$6(this, _MessageStream_errored, "f");
    }
    get aborted() {
        return __classPrivateFieldGet$6(this, _MessageStream_aborted, "f");
    }
    abort() {
        this.controller.abort();
    }
    /**
     * Adds the listener function to the end of the listeners array for the event.
     * No checks are made to see if the listener has already been added. Multiple calls passing
     * the same combination of event and listener will result in the listener being added, and
     * called, multiple times.
     * @returns this MessageStream, so that calls can be chained
     */
    on(event, listener) {
        const listeners = __classPrivateFieldGet$6(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet$6(this, _MessageStream_listeners, "f")[event] = []);
        listeners.push({ listener });
        return this;
    }
    /**
     * Removes the specified listener from the listener array for the event.
     * off() will remove, at most, one instance of a listener from the listener array. If any single
     * listener has been added multiple times to the listener array for the specified event, then
     * off() must be called multiple times to remove each instance.
     * @returns this MessageStream, so that calls can be chained
     */
    off(event, listener) {
        const listeners = __classPrivateFieldGet$6(this, _MessageStream_listeners, "f")[event];
        if (!listeners)
            return this;
        const index = listeners.findIndex((l) => l.listener === listener);
        if (index >= 0)
            listeners.splice(index, 1);
        return this;
    }
    /**
     * Adds a one-time listener function for the event. The next time the event is triggered,
     * this listener is removed and then invoked.
     * @returns this MessageStream, so that calls can be chained
     */
    once(event, listener) {
        const listeners = __classPrivateFieldGet$6(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet$6(this, _MessageStream_listeners, "f")[event] = []);
        listeners.push({ listener, once: true });
        return this;
    }
    /**
     * This is similar to `.once()`, but returns a Promise that resolves the next time
     * the event is triggered, instead of calling a listener callback.
     * @returns a Promise that resolves the next time given event is triggered,
     * or rejects if an error is emitted.  (If you request the 'error' event,
     * returns a promise that resolves with the error).
     *
     * Example:
     *
     *   const message = await stream.emitted('message') // rejects if the stream errors
     */
    emitted(event) {
        return new Promise((resolve, reject) => {
            __classPrivateFieldSet$5(this, _MessageStream_catchingPromiseCreated, true, "f");
            if (event !== 'error')
                this.once('error', reject);
            this.once(event, resolve);
        });
    }
    async done() {
        __classPrivateFieldSet$5(this, _MessageStream_catchingPromiseCreated, true, "f");
        await __classPrivateFieldGet$6(this, _MessageStream_endPromise, "f");
    }
    get currentMessage() {
        return __classPrivateFieldGet$6(this, _MessageStream_currentMessageSnapshot, "f");
    }
    /**
     * @returns a promise that resolves with the the final assistant Message response,
     * or rejects if an error occurred or the stream ended prematurely without producing a Message.
     */
    async finalMessage() {
        await this.done();
        return __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this);
    }
    /**
     * @returns a promise that resolves with the the final assistant Message's text response, concatenated
     * together if there are more than one text blocks.
     * Rejects if an error occurred or the stream ended prematurely without producing a Message.
     */
    async finalText() {
        await this.done();
        return __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_getFinalText).call(this);
    }
    _emit(event, ...args) {
        // make sure we don't emit any MessageStreamEvents after end
        if (__classPrivateFieldGet$6(this, _MessageStream_ended, "f"))
            return;
        if (event === 'end') {
            __classPrivateFieldSet$5(this, _MessageStream_ended, true, "f");
            __classPrivateFieldGet$6(this, _MessageStream_resolveEndPromise, "f").call(this);
        }
        const listeners = __classPrivateFieldGet$6(this, _MessageStream_listeners, "f")[event];
        if (listeners) {
            __classPrivateFieldGet$6(this, _MessageStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
            listeners.forEach(({ listener }) => listener(...args));
        }
        if (event === 'abort') {
            const error = args[0];
            if (!__classPrivateFieldGet$6(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
                Promise.reject(error);
            }
            __classPrivateFieldGet$6(this, _MessageStream_rejectConnectedPromise, "f").call(this, error);
            __classPrivateFieldGet$6(this, _MessageStream_rejectEndPromise, "f").call(this, error);
            this._emit('end');
            return;
        }
        if (event === 'error') {
            // NOTE: _emit('error', error) should only be called from #handleError().
            const error = args[0];
            if (!__classPrivateFieldGet$6(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
                // Trigger an unhandled rejection if the user hasn't registered any error handlers.
                // If you are seeing stack traces here, make sure to handle errors via either:
                // - runner.on('error', () => ...)
                // - await runner.done()
                // - await runner.final...()
                // - etc.
                Promise.reject(error);
            }
            __classPrivateFieldGet$6(this, _MessageStream_rejectConnectedPromise, "f").call(this, error);
            __classPrivateFieldGet$6(this, _MessageStream_rejectEndPromise, "f").call(this, error);
            this._emit('end');
        }
    }
    _emitFinal() {
        const finalMessage = this.receivedMessages.at(-1);
        if (finalMessage) {
            this._emit('finalMessage', __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this));
        }
    }
    async _fromReadableStream(readableStream, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
        this._connected();
        const stream = Stream$1.fromReadableStream(readableStream, this.controller);
        for await (const event of stream) {
            __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError$1();
        }
        __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
    }
    [(_MessageStream_currentMessageSnapshot = new WeakMap(), _MessageStream_connectedPromise = new WeakMap(), _MessageStream_resolveConnectedPromise = new WeakMap(), _MessageStream_rejectConnectedPromise = new WeakMap(), _MessageStream_endPromise = new WeakMap(), _MessageStream_resolveEndPromise = new WeakMap(), _MessageStream_rejectEndPromise = new WeakMap(), _MessageStream_listeners = new WeakMap(), _MessageStream_ended = new WeakMap(), _MessageStream_errored = new WeakMap(), _MessageStream_aborted = new WeakMap(), _MessageStream_catchingPromiseCreated = new WeakMap(), _MessageStream_handleError = new WeakMap(), _MessageStream_instances = new WeakSet(), _MessageStream_getFinalMessage = function _MessageStream_getFinalMessage() {
        if (this.receivedMessages.length === 0) {
            throw new AnthropicError('stream ended without producing a Message with role=assistant');
        }
        return this.receivedMessages.at(-1);
    }, _MessageStream_getFinalText = function _MessageStream_getFinalText() {
        if (this.receivedMessages.length === 0) {
            throw new AnthropicError('stream ended without producing a Message with role=assistant');
        }
        const textBlocks = this.receivedMessages
            .at(-1)
            .content.filter((block) => block.type === 'text')
            .map((block) => block.text);
        if (textBlocks.length === 0) {
            throw new AnthropicError('stream ended without producing a content block with type=text');
        }
        return textBlocks.join(' ');
    }, _MessageStream_beginRequest = function _MessageStream_beginRequest() {
        if (this.ended)
            return;
        __classPrivateFieldSet$5(this, _MessageStream_currentMessageSnapshot, undefined, "f");
    }, _MessageStream_addStreamEvent = function _MessageStream_addStreamEvent(event) {
        if (this.ended)
            return;
        const messageSnapshot = __classPrivateFieldGet$6(this, _MessageStream_instances, "m", _MessageStream_accumulateMessage).call(this, event);
        this._emit('streamEvent', event, messageSnapshot);
        switch (event.type) {
            case 'content_block_delta': {
                const content = messageSnapshot.content.at(-1);
                if (event.delta.type === 'text_delta' && content.type === 'text') {
                    this._emit('text', event.delta.text, content.text || '');
                }
                else if (event.delta.type === 'input_json_delta' && content.type === 'tool_use') {
                    if (content.input) {
                        this._emit('inputJson', event.delta.partial_json, content.input);
                    }
                }
                break;
            }
            case 'message_stop': {
                this._addMessageParam(messageSnapshot);
                this._addMessage(messageSnapshot, true);
                break;
            }
            case 'content_block_stop': {
                this._emit('contentBlock', messageSnapshot.content.at(-1));
                break;
            }
            case 'message_start': {
                __classPrivateFieldSet$5(this, _MessageStream_currentMessageSnapshot, messageSnapshot, "f");
                break;
            }
        }
    }, _MessageStream_endRequest = function _MessageStream_endRequest() {
        if (this.ended) {
            throw new AnthropicError(`stream has ended, this shouldn't happen`);
        }
        const snapshot = __classPrivateFieldGet$6(this, _MessageStream_currentMessageSnapshot, "f");
        if (!snapshot) {
            throw new AnthropicError(`request ended without sending any chunks`);
        }
        __classPrivateFieldSet$5(this, _MessageStream_currentMessageSnapshot, undefined, "f");
        return snapshot;
    }, _MessageStream_accumulateMessage = function _MessageStream_accumulateMessage(event) {
        let snapshot = __classPrivateFieldGet$6(this, _MessageStream_currentMessageSnapshot, "f");
        if (event.type === 'message_start') {
            if (snapshot) {
                throw new AnthropicError(`Unexpected event order, got ${event.type} before receiving "message_stop"`);
            }
            return event.message;
        }
        if (!snapshot) {
            throw new AnthropicError(`Unexpected event order, got ${event.type} before "message_start"`);
        }
        switch (event.type) {
            case 'message_stop':
                return snapshot;
            case 'message_delta':
                snapshot.stop_reason = event.delta.stop_reason;
                snapshot.stop_sequence = event.delta.stop_sequence;
                snapshot.usage.output_tokens = event.usage.output_tokens;
                return snapshot;
            case 'content_block_start':
                snapshot.content.push(event.content_block);
                return snapshot;
            case 'content_block_delta': {
                const snapshotContent = snapshot.content.at(event.index);
                if (snapshotContent?.type === 'text' && event.delta.type === 'text_delta') {
                    snapshotContent.text += event.delta.text;
                }
                else if (snapshotContent?.type === 'tool_use' && event.delta.type === 'input_json_delta') {
                    // we need to keep track of the raw JSON string as well so that we can
                    // re-parse it for each delta, for now we just store it as an untyped
                    // non-enumerable property on the snapshot
                    let jsonBuf = snapshotContent[JSON_BUF_PROPERTY] || '';
                    jsonBuf += event.delta.partial_json;
                    Object.defineProperty(snapshotContent, JSON_BUF_PROPERTY, {
                        value: jsonBuf,
                        enumerable: false,
                        writable: true,
                    });
                    if (jsonBuf) {
                        snapshotContent.input = partialParse$1(jsonBuf);
                    }
                }
                return snapshot;
            }
            case 'content_block_stop':
                return snapshot;
        }
    }, Symbol.asyncIterator)]() {
        const pushQueue = [];
        const readQueue = [];
        let done = false;
        this.on('streamEvent', (event) => {
            const reader = readQueue.shift();
            if (reader) {
                reader.resolve(event);
            }
            else {
                pushQueue.push(event);
            }
        });
        this.on('end', () => {
            done = true;
            for (const reader of readQueue) {
                reader.resolve(undefined);
            }
            readQueue.length = 0;
        });
        this.on('abort', (err) => {
            done = true;
            for (const reader of readQueue) {
                reader.reject(err);
            }
            readQueue.length = 0;
        });
        this.on('error', (err) => {
            done = true;
            for (const reader of readQueue) {
                reader.reject(err);
            }
            readQueue.length = 0;
        });
        return {
            next: async () => {
                if (!pushQueue.length) {
                    if (done) {
                        return { value: undefined, done: true };
                    }
                    return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk) => (chunk ? { value: chunk, done: false } : { value: undefined, done: true }));
                }
                const chunk = pushQueue.shift();
                return { value: chunk, done: false };
            },
            return: async () => {
                this.abort();
                return { value: undefined, done: true };
            },
        };
    }
    toReadableStream() {
        const stream = new Stream$1(this[Symbol.asyncIterator].bind(this), this.controller);
        return stream.toReadableStream();
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Messages$2 = class Messages extends APIResource$1 {
    constructor() {
        super(...arguments);
        this.batches = new Batches$1(this._client);
    }
    create(body, options) {
        if (body.model in DEPRECATED_MODELS) {
            console.warn(`The model '${body.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS[body.model]}\nPlease migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
        }
        return this._client.post('/v1/messages', {
            body,
            timeout: this._client._options.timeout ?? 600000,
            ...options,
            stream: body.stream ?? false,
        });
    }
    /**
     * Create a Message stream
     */
    stream(body, options) {
        return MessageStream.createMessage(this, body, options);
    }
    /**
     * Count the number of tokens in a Message.
     *
     * The Token Count API can be used to count the number of tokens in a Message,
     * including tools, images, and documents, without creating it.
     */
    countTokens(body, options) {
        return this._client.post('/v1/messages/count_tokens', { body, ...options });
    }
};
const DEPRECATED_MODELS = {
    'claude-1.3': 'November 6th, 2024',
    'claude-1.3-100k': 'November 6th, 2024',
    'claude-instant-1.1': 'November 6th, 2024',
    'claude-instant-1.1-100k': 'November 6th, 2024',
    'claude-instant-1.2': 'November 6th, 2024',
};
Messages$2.Batches = Batches$1;
Messages$2.MessageBatchesPage = MessageBatchesPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Models$1 = class Models extends APIResource$1 {
    /**
     * Get a specific model.
     *
     * The Models API response can be used to determine information about a specific
     * model or resolve a model alias to a model ID.
     */
    retrieve(modelId, options) {
        return this._client.get(`/v1/models/${modelId}`, options);
    }
    list(query = {}, options) {
        if (isRequestOptions$1(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/v1/models', ModelInfosPage, { query, ...options });
    }
};
class ModelInfosPage extends Page$1 {
}
Models$1.ModelInfosPage = ModelInfosPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
var _a$1;
/**
 * API Client for interfacing with the Anthropic API.
 */
class Anthropic extends APIClient$1 {
    /**
     * API Client for interfacing with the Anthropic API.
     *
     * @param {string | null | undefined} [opts.apiKey=process.env['ANTHROPIC_API_KEY'] ?? null]
     * @param {string | null | undefined} [opts.authToken=process.env['ANTHROPIC_AUTH_TOKEN'] ?? null]
     * @param {string} [opts.baseURL=process.env['ANTHROPIC_BASE_URL'] ?? https://api.anthropic.com] - Override the default base URL for the API.
     * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
     * @param {number} [opts.httpAgent] - An HTTP agent used to manage HTTP(s) connections.
     * @param {Core.Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
     * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
     * @param {Core.Headers} opts.defaultHeaders - Default headers to include with every request to the API.
     * @param {Core.DefaultQuery} opts.defaultQuery - Default query parameters to include with every request to the API.
     * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
     */
    constructor({ baseURL = readEnv$1('ANTHROPIC_BASE_URL'), apiKey = readEnv$1('ANTHROPIC_API_KEY') ?? null, authToken = readEnv$1('ANTHROPIC_AUTH_TOKEN') ?? null, ...opts } = {}) {
        const options = {
            apiKey,
            authToken,
            ...opts,
            baseURL: baseURL || `https://api.anthropic.com`,
        };
        if (!options.dangerouslyAllowBrowser && isRunningInBrowser$1()) {
            throw new AnthropicError("It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew Anthropic({ apiKey, dangerouslyAllowBrowser: true });\n");
        }
        super({
            baseURL: options.baseURL,
            timeout: options.timeout ?? 600000 /* 10 minutes */,
            httpAgent: options.httpAgent,
            maxRetries: options.maxRetries,
            fetch: options.fetch,
        });
        this.completions = new Completions$3(this);
        this.messages = new Messages$2(this);
        this.models = new Models$1(this);
        this.beta = new Beta$1(this);
        this._options = options;
        this.apiKey = apiKey;
        this.authToken = authToken;
    }
    defaultQuery() {
        return this._options.defaultQuery;
    }
    defaultHeaders(opts) {
        return {
            ...super.defaultHeaders(opts),
            ...(this._options.dangerouslyAllowBrowser ?
                { 'anthropic-dangerous-direct-browser-access': 'true' }
                : undefined),
            'anthropic-version': '2023-06-01',
            ...this._options.defaultHeaders,
        };
    }
    validateHeaders(headers, customHeaders) {
        if (this.apiKey && headers['x-api-key']) {
            return;
        }
        if (customHeaders['x-api-key'] === null) {
            return;
        }
        if (this.authToken && headers['authorization']) {
            return;
        }
        if (customHeaders['authorization'] === null) {
            return;
        }
        throw new Error('Could not resolve authentication method. Expected either apiKey or authToken to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted');
    }
    authHeaders(opts) {
        const apiKeyAuth = this.apiKeyAuth(opts);
        const bearerAuth = this.bearerAuth(opts);
        if (apiKeyAuth != null && !isEmptyObj$1(apiKeyAuth)) {
            return apiKeyAuth;
        }
        if (bearerAuth != null && !isEmptyObj$1(bearerAuth)) {
            return bearerAuth;
        }
        return {};
    }
    apiKeyAuth(opts) {
        if (this.apiKey == null) {
            return {};
        }
        return { 'X-Api-Key': this.apiKey };
    }
    bearerAuth(opts) {
        if (this.authToken == null) {
            return {};
        }
        return { Authorization: `Bearer ${this.authToken}` };
    }
}
_a$1 = Anthropic;
Anthropic.Anthropic = _a$1;
Anthropic.HUMAN_PROMPT = '\n\nHuman:';
Anthropic.AI_PROMPT = '\n\nAssistant:';
Anthropic.DEFAULT_TIMEOUT = 600000; // 10 minutes
Anthropic.AnthropicError = AnthropicError;
Anthropic.APIError = APIError$1;
Anthropic.APIConnectionError = APIConnectionError$1;
Anthropic.APIConnectionTimeoutError = APIConnectionTimeoutError$1;
Anthropic.APIUserAbortError = APIUserAbortError$1;
Anthropic.NotFoundError = NotFoundError$1;
Anthropic.ConflictError = ConflictError$1;
Anthropic.RateLimitError = RateLimitError$1;
Anthropic.BadRequestError = BadRequestError$1;
Anthropic.AuthenticationError = AuthenticationError$1;
Anthropic.InternalServerError = InternalServerError$1;
Anthropic.PermissionDeniedError = PermissionDeniedError$1;
Anthropic.UnprocessableEntityError = UnprocessableEntityError$1;
Anthropic.toFile = toFile$1;
Anthropic.fileFromPath = fileFromPath$1;
Anthropic.Completions = Completions$3;
Anthropic.Messages = Messages$2;
Anthropic.Models = Models$1;
Anthropic.ModelInfosPage = ModelInfosPage;
Anthropic.Beta = Beta$1;
const { HUMAN_PROMPT, AI_PROMPT } = Anthropic;

class ClaudeProvider {
    constructor(param, defaultModel, options) {
        this.defaultModel = 'claude-3-5-sonnet-20241022';
        if (defaultModel) {
            this.defaultModel = defaultModel;
        }
        if (typeof window !== 'undefined' &&
            typeof document !== 'undefined' &&
            (typeof param == 'string' || param.apiKey)) {
            console.warn(`
        ⚠️ Security Warning:
        DO NOT use API Keys in browser/frontend code!
        This will expose your credentials and may lead to unauthorized usage.
        
        Best Practices: Configure backend API proxy request through baseURL and request headers.

        Please refer to the link: https://eko.fellou.ai/docs/getting-started/configuration#web-environment
      `);
        }
        if (typeof param == 'string') {
            this.client = new Anthropic({
                apiKey: param,
                dangerouslyAllowBrowser: true,
                ...options,
            });
        }
        else if (param.messages && param.completions) {
            this.client = param;
        }
        else {
            let options = param;
            options.dangerouslyAllowBrowser = true;
            this.client = new Anthropic(options);
        }
    }
    processResponse(response) {
        const toolCalls = response.content
            .filter((block) => block.type === 'tool_use')
            .map((block) => ({
            id: block.id,
            name: block.name,
            input: block.input,
        }));
        const textContent = response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n');
        return {
            textContent: textContent || null,
            content: response.content,
            toolCalls,
            stop_reason: response.stop_reason,
        };
    }
    async generateText(messages, params) {
        let system = messages
            .filter((s) => s.role == 'system')
            .map((s) => {
            if (typeof s.content == 'string') {
                return s.content;
            }
            else {
                return s.content[0].text;
            }
        })[0];
        const response = await this.client.messages.create({
            system,
            model: params.model || this.defaultModel,
            max_tokens: params.maxTokens || 1024,
            temperature: params.temperature,
            messages: messages.filter((s) => s.role != 'system'),
            tools: params.tools,
            tool_choice: params.toolChoice,
        });
        return this.processResponse(response);
    }
    async generateStream(messages, params, handler) {
        var _a, _b, _c, _d, _e, _f;
        let system = messages
            .filter((s) => s.role == 'system')
            .map((s) => {
            if (typeof s.content == 'string') {
                return s.content;
            }
            else {
                return s.content[0].text;
            }
        })[0];
        const stream = await this.client.messages.stream({
            system,
            model: params.model || this.defaultModel,
            max_tokens: params.maxTokens || 4096,
            temperature: params.temperature,
            messages: messages.filter((s) => s.role != 'system'),
            tools: params.tools,
            tool_choice: params.toolChoice,
        });
        (_a = handler.onStart) === null || _a === void 0 ? void 0 : _a.call(handler);
        let currentToolUse = null;
        try {
            for await (const event of stream) {
                switch (event.type) {
                    case 'content_block_start':
                        if (event.content_block.type === 'text') {
                            (_b = handler.onContent) === null || _b === void 0 ? void 0 : _b.call(handler, '');
                        }
                        else if (event.content_block.type === 'tool_use') {
                            currentToolUse = {
                                id: event.content_block.id,
                                name: event.content_block.name,
                                accumulatedJson: '',
                            };
                        }
                        break;
                    case 'content_block_delta':
                        if (event.delta.type === 'text_delta') {
                            (_c = handler.onContent) === null || _c === void 0 ? void 0 : _c.call(handler, event.delta.text);
                        }
                        else if (event.delta.type === 'input_json_delta' && currentToolUse) {
                            currentToolUse.accumulatedJson += event.delta.partial_json;
                        }
                        break;
                    case 'content_block_stop':
                        if (currentToolUse) {
                            const toolCall = {
                                id: currentToolUse.id,
                                name: currentToolUse.name,
                                input: JSON.parse(currentToolUse.accumulatedJson || '{}'),
                            };
                            (_d = handler.onToolUse) === null || _d === void 0 ? void 0 : _d.call(handler, toolCall);
                            currentToolUse = null;
                        }
                        break;
                }
            }
            const message = await stream.finalMessage();
            (_e = handler.onComplete) === null || _e === void 0 ? void 0 : _e.call(handler, this.processResponse(message));
        }
        catch (error) {
            (_f = handler.onError) === null || _f === void 0 ? void 0 : _f.call(handler, error);
        }
    }
}

const default_format = 'RFC3986';
const formatters = {
    RFC1738: (v) => String(v).replace(/%20/g, '+'),
    RFC3986: (v) => String(v),
};
const RFC1738 = 'RFC1738';

const is_array$1 = Array.isArray;
const hex_table = (() => {
    const array = [];
    for (let i = 0; i < 256; ++i) {
        array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase());
    }
    return array;
})();
const limit = 1024;
const encode = (str, _defaultEncoder, charset, _kind, format) => {
    // This code was originally written by Brian White for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }
    let string = str;
    if (typeof str === 'symbol') {
        string = Symbol.prototype.toString.call(str);
    }
    else if (typeof str !== 'string') {
        string = String(str);
    }
    if (charset === 'iso-8859-1') {
        return escape(string).replace(/%u[0-9a-f]{4}/gi, function ($0) {
            return '%26%23' + parseInt($0.slice(2), 16) + '%3B';
        });
    }
    let out = '';
    for (let j = 0; j < string.length; j += limit) {
        const segment = string.length >= limit ? string.slice(j, j + limit) : string;
        const arr = [];
        for (let i = 0; i < segment.length; ++i) {
            let c = segment.charCodeAt(i);
            if (c === 0x2d || // -
                c === 0x2e || // .
                c === 0x5f || // _
                c === 0x7e || // ~
                (c >= 0x30 && c <= 0x39) || // 0-9
                (c >= 0x41 && c <= 0x5a) || // a-z
                (c >= 0x61 && c <= 0x7a) || // A-Z
                (format === RFC1738 && (c === 0x28 || c === 0x29)) // ( )
            ) {
                arr[arr.length] = segment.charAt(i);
                continue;
            }
            if (c < 0x80) {
                arr[arr.length] = hex_table[c];
                continue;
            }
            if (c < 0x800) {
                arr[arr.length] = hex_table[0xc0 | (c >> 6)] + hex_table[0x80 | (c & 0x3f)];
                continue;
            }
            if (c < 0xd800 || c >= 0xe000) {
                arr[arr.length] =
                    hex_table[0xe0 | (c >> 12)] + hex_table[0x80 | ((c >> 6) & 0x3f)] + hex_table[0x80 | (c & 0x3f)];
                continue;
            }
            i += 1;
            c = 0x10000 + (((c & 0x3ff) << 10) | (segment.charCodeAt(i) & 0x3ff));
            arr[arr.length] =
                hex_table[0xf0 | (c >> 18)] +
                    hex_table[0x80 | ((c >> 12) & 0x3f)] +
                    hex_table[0x80 | ((c >> 6) & 0x3f)] +
                    hex_table[0x80 | (c & 0x3f)];
        }
        out += arr.join('');
    }
    return out;
};
function is_buffer(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
}
function maybe_map(val, fn) {
    if (is_array$1(val)) {
        const mapped = [];
        for (let i = 0; i < val.length; i += 1) {
            mapped.push(fn(val[i]));
        }
        return mapped;
    }
    return fn(val);
}

const has = Object.prototype.hasOwnProperty;
const array_prefix_generators = {
    brackets(prefix) {
        return String(prefix) + '[]';
    },
    comma: 'comma',
    indices(prefix, key) {
        return String(prefix) + '[' + key + ']';
    },
    repeat(prefix) {
        return String(prefix);
    },
};
const is_array = Array.isArray;
const push = Array.prototype.push;
const push_to_array = function (arr, value_or_array) {
    push.apply(arr, is_array(value_or_array) ? value_or_array : [value_or_array]);
};
const to_ISO = Date.prototype.toISOString;
const defaults = {
    addQueryPrefix: false,
    allowDots: false,
    allowEmptyArrays: false,
    arrayFormat: 'indices',
    charset: 'utf-8',
    charsetSentinel: false,
    delimiter: '&',
    encode: true,
    encodeDotInKeys: false,
    encoder: encode,
    encodeValuesOnly: false,
    format: default_format,
    formatter: formatters[default_format],
    /** @deprecated */
    indices: false,
    serializeDate(date) {
        return to_ISO.call(date);
    },
    skipNulls: false,
    strictNullHandling: false,
};
function is_non_nullish_primitive(v) {
    return (typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean' ||
        typeof v === 'symbol' ||
        typeof v === 'bigint');
}
const sentinel = {};
function inner_stringify(object, prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, sideChannel) {
    let obj = object;
    let tmp_sc = sideChannel;
    let step = 0;
    let find_flag = false;
    while ((tmp_sc = tmp_sc.get(sentinel)) !== void 0 && !find_flag) {
        // Where object last appeared in the ref tree
        const pos = tmp_sc.get(object);
        step += 1;
        if (typeof pos !== 'undefined') {
            if (pos === step) {
                throw new RangeError('Cyclic object value');
            }
            else {
                find_flag = true; // Break while
            }
        }
        if (typeof tmp_sc.get(sentinel) === 'undefined') {
            step = 0;
        }
    }
    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    }
    else if (obj instanceof Date) {
        obj = serializeDate?.(obj);
    }
    else if (generateArrayPrefix === 'comma' && is_array(obj)) {
        obj = maybe_map(obj, function (value) {
            if (value instanceof Date) {
                return serializeDate?.(value);
            }
            return value;
        });
    }
    if (obj === null) {
        if (strictNullHandling) {
            return encoder && !encodeValuesOnly ?
                // @ts-expect-error
                encoder(prefix, defaults.encoder, charset, 'key', format)
                : prefix;
        }
        obj = '';
    }
    if (is_non_nullish_primitive(obj) || is_buffer(obj)) {
        if (encoder) {
            const key_value = encodeValuesOnly ? prefix
                // @ts-expect-error
                : encoder(prefix, defaults.encoder, charset, 'key', format);
            return [
                formatter?.(key_value) +
                    '=' +
                    // @ts-expect-error
                    formatter?.(encoder(obj, defaults.encoder, charset, 'value', format)),
            ];
        }
        return [formatter?.(prefix) + '=' + formatter?.(String(obj))];
    }
    const values = [];
    if (typeof obj === 'undefined') {
        return values;
    }
    let obj_keys;
    if (generateArrayPrefix === 'comma' && is_array(obj)) {
        // we need to join elements in
        if (encodeValuesOnly && encoder) {
            // @ts-expect-error values only
            obj = maybe_map(obj, encoder);
        }
        obj_keys = [{ value: obj.length > 0 ? obj.join(',') || null : void 0 }];
    }
    else if (is_array(filter)) {
        obj_keys = filter;
    }
    else {
        const keys = Object.keys(obj);
        obj_keys = sort ? keys.sort(sort) : keys;
    }
    const encoded_prefix = encodeDotInKeys ? String(prefix).replace(/\./g, '%2E') : String(prefix);
    const adjusted_prefix = commaRoundTrip && is_array(obj) && obj.length === 1 ? encoded_prefix + '[]' : encoded_prefix;
    if (allowEmptyArrays && is_array(obj) && obj.length === 0) {
        return adjusted_prefix + '[]';
    }
    for (let j = 0; j < obj_keys.length; ++j) {
        const key = obj_keys[j];
        const value = 
        // @ts-ignore
        typeof key === 'object' && typeof key.value !== 'undefined' ? key.value : obj[key];
        if (skipNulls && value === null) {
            continue;
        }
        // @ts-ignore
        const encoded_key = allowDots && encodeDotInKeys ? key.replace(/\./g, '%2E') : key;
        const key_prefix = is_array(obj) ?
            typeof generateArrayPrefix === 'function' ?
                generateArrayPrefix(adjusted_prefix, encoded_key)
                : adjusted_prefix
            : adjusted_prefix + (allowDots ? '.' + encoded_key : '[' + encoded_key + ']');
        sideChannel.set(object, step);
        const valueSideChannel = new WeakMap();
        valueSideChannel.set(sentinel, sideChannel);
        push_to_array(values, inner_stringify(value, key_prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, 
        // @ts-ignore
        generateArrayPrefix === 'comma' && encodeValuesOnly && is_array(obj) ? null : encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, valueSideChannel));
    }
    return values;
}
function normalize_stringify_options(opts = defaults) {
    if (typeof opts.allowEmptyArrays !== 'undefined' && typeof opts.allowEmptyArrays !== 'boolean') {
        throw new TypeError('`allowEmptyArrays` option can only be `true` or `false`, when provided');
    }
    if (typeof opts.encodeDotInKeys !== 'undefined' && typeof opts.encodeDotInKeys !== 'boolean') {
        throw new TypeError('`encodeDotInKeys` option can only be `true` or `false`, when provided');
    }
    if (opts.encoder !== null && typeof opts.encoder !== 'undefined' && typeof opts.encoder !== 'function') {
        throw new TypeError('Encoder has to be a function.');
    }
    const charset = opts.charset || defaults.charset;
    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }
    let format = default_format;
    if (typeof opts.format !== 'undefined') {
        if (!has.call(formatters, opts.format)) {
            throw new TypeError('Unknown format option provided.');
        }
        format = opts.format;
    }
    const formatter = formatters[format];
    let filter = defaults.filter;
    if (typeof opts.filter === 'function' || is_array(opts.filter)) {
        filter = opts.filter;
    }
    let arrayFormat;
    if (opts.arrayFormat && opts.arrayFormat in array_prefix_generators) {
        arrayFormat = opts.arrayFormat;
    }
    else if ('indices' in opts) {
        arrayFormat = opts.indices ? 'indices' : 'repeat';
    }
    else {
        arrayFormat = defaults.arrayFormat;
    }
    if ('commaRoundTrip' in opts && typeof opts.commaRoundTrip !== 'boolean') {
        throw new TypeError('`commaRoundTrip` must be a boolean, or absent');
    }
    const allowDots = typeof opts.allowDots === 'undefined' ?
        !!opts.encodeDotInKeys === true ?
            true
            : defaults.allowDots
        : !!opts.allowDots;
    return {
        addQueryPrefix: typeof opts.addQueryPrefix === 'boolean' ? opts.addQueryPrefix : defaults.addQueryPrefix,
        // @ts-ignore
        allowDots: allowDots,
        allowEmptyArrays: typeof opts.allowEmptyArrays === 'boolean' ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
        arrayFormat: arrayFormat,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        commaRoundTrip: !!opts.commaRoundTrip,
        delimiter: typeof opts.delimiter === 'undefined' ? defaults.delimiter : opts.delimiter,
        encode: typeof opts.encode === 'boolean' ? opts.encode : defaults.encode,
        encodeDotInKeys: typeof opts.encodeDotInKeys === 'boolean' ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
        encoder: typeof opts.encoder === 'function' ? opts.encoder : defaults.encoder,
        encodeValuesOnly: typeof opts.encodeValuesOnly === 'boolean' ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
        filter: filter,
        format: format,
        formatter: formatter,
        serializeDate: typeof opts.serializeDate === 'function' ? opts.serializeDate : defaults.serializeDate,
        skipNulls: typeof opts.skipNulls === 'boolean' ? opts.skipNulls : defaults.skipNulls,
        // @ts-ignore
        sort: typeof opts.sort === 'function' ? opts.sort : null,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling,
    };
}
function stringify(object, opts = {}) {
    let obj = object;
    const options = normalize_stringify_options(opts);
    let obj_keys;
    let filter;
    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    }
    else if (is_array(options.filter)) {
        filter = options.filter;
        obj_keys = filter;
    }
    const keys = [];
    if (typeof obj !== 'object' || obj === null) {
        return '';
    }
    const generateArrayPrefix = array_prefix_generators[options.arrayFormat];
    const commaRoundTrip = generateArrayPrefix === 'comma' && options.commaRoundTrip;
    if (!obj_keys) {
        obj_keys = Object.keys(obj);
    }
    if (options.sort) {
        obj_keys.sort(options.sort);
    }
    const sideChannel = new WeakMap();
    for (let i = 0; i < obj_keys.length; ++i) {
        const key = obj_keys[i];
        if (options.skipNulls && obj[key] === null) {
            continue;
        }
        push_to_array(keys, inner_stringify(obj[key], key, 
        // @ts-expect-error
        generateArrayPrefix, commaRoundTrip, options.allowEmptyArrays, options.strictNullHandling, options.skipNulls, options.encodeDotInKeys, options.encode ? options.encoder : null, options.filter, options.sort, options.allowDots, options.serializeDate, options.format, options.formatter, options.encodeValuesOnly, options.charset, sideChannel));
    }
    const joined = keys.join(options.delimiter);
    let prefix = options.addQueryPrefix === true ? '?' : '';
    if (options.charsetSentinel) {
        if (options.charset === 'iso-8859-1') {
            // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
            prefix += 'utf8=%26%2310003%3B&';
        }
        else {
            // encodeURIComponent('✓')
            prefix += 'utf8=%E2%9C%93&';
        }
    }
    return joined.length > 0 ? prefix + joined : '';
}

const VERSION = '4.85.3'; // x-release-please-version

let auto = false;
let kind = undefined;
let fetch$1 = undefined;
let FormData$1 = undefined;
let File$1 = undefined;
let ReadableStream$1 = undefined;
let getMultipartRequestOptions = undefined;
let getDefaultAgent = undefined;
let fileFromPath = undefined;
let isFsReadStream = undefined;
function setShims(shims, options = { auto: false }) {
    if (auto) {
        throw new Error(`you must \`import 'openai/shims/${shims.kind}'\` before importing anything else from openai`);
    }
    if (kind) {
        throw new Error(`can't \`import 'openai/shims/${shims.kind}'\` after \`import 'openai/shims/${kind}'\``);
    }
    auto = options.auto;
    kind = shims.kind;
    fetch$1 = shims.fetch;
    FormData$1 = shims.FormData;
    File$1 = shims.File;
    ReadableStream$1 = shims.ReadableStream;
    getMultipartRequestOptions = shims.getMultipartRequestOptions;
    getDefaultAgent = shims.getDefaultAgent;
    fileFromPath = shims.fileFromPath;
    isFsReadStream = shims.isFsReadStream;
}

/**
 * Disclaimer: modules in _shims aren't intended to be imported by SDK users.
 */
class MultipartBody {
    constructor(body) {
        this.body = body;
    }
    get [Symbol.toStringTag]() {
        return 'MultipartBody';
    }
}

function getRuntime({ manuallyImported } = {}) {
    const recommendation = manuallyImported ?
        `You may need to use polyfills`
        : `Add one of these imports before your first \`import … from 'openai'\`:
- \`import 'openai/shims/node'\` (if you're running on Node)
- \`import 'openai/shims/web'\` (otherwise)
`;
    let _fetch, _Request, _Response, _Headers;
    try {
        // @ts-ignore
        _fetch = fetch;
        // @ts-ignore
        _Request = Request;
        // @ts-ignore
        _Response = Response;
        // @ts-ignore
        _Headers = Headers;
    }
    catch (error) {
        throw new Error(`this environment is missing the following Web Fetch API type: ${error.message}. ${recommendation}`);
    }
    return {
        kind: 'web',
        fetch: _fetch,
        Request: _Request,
        Response: _Response,
        Headers: _Headers,
        FormData: 
        // @ts-ignore
        typeof FormData !== 'undefined' ? FormData : (class FormData {
            // @ts-ignore
            constructor() {
                throw new Error(`file uploads aren't supported in this environment yet as 'FormData' is undefined. ${recommendation}`);
            }
        }),
        Blob: typeof Blob !== 'undefined' ? Blob : (class Blob {
            constructor() {
                throw new Error(`file uploads aren't supported in this environment yet as 'Blob' is undefined. ${recommendation}`);
            }
        }),
        File: 
        // @ts-ignore
        typeof File !== 'undefined' ? File : (class File {
            // @ts-ignore
            constructor() {
                throw new Error(`file uploads aren't supported in this environment yet as 'File' is undefined. ${recommendation}`);
            }
        }),
        ReadableStream: 
        // @ts-ignore
        typeof ReadableStream !== 'undefined' ? ReadableStream : (class ReadableStream {
            // @ts-ignore
            constructor() {
                throw new Error(`streaming isn't supported in this environment yet as 'ReadableStream' is undefined. ${recommendation}`);
            }
        }),
        getMultipartRequestOptions: async (
        // @ts-ignore
        form, opts) => ({
            ...opts,
            body: new MultipartBody(form),
        }),
        getDefaultAgent: (url) => undefined,
        fileFromPath: () => {
            throw new Error('The `fileFromPath` function is only supported in Node. See the README for more details: https://www.github.com/openai/openai-node#file-uploads');
        },
        isFsReadStream: (value) => false,
    };
}

/**
 * Disclaimer: modules in _shims aren't intended to be imported by SDK users.
 */
if (!kind) setShims(getRuntime(), { auto: true });

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class OpenAIError extends Error {
}
class APIError extends OpenAIError {
    constructor(status, error, message, headers) {
        super(`${APIError.makeMessage(status, error, message)}`);
        this.status = status;
        this.headers = headers;
        this.request_id = headers?.['x-request-id'];
        this.error = error;
        const data = error;
        this.code = data?.['code'];
        this.param = data?.['param'];
        this.type = data?.['type'];
    }
    static makeMessage(status, error, message) {
        const msg = error?.message ?
            typeof error.message === 'string' ?
                error.message
                : JSON.stringify(error.message)
            : error ? JSON.stringify(error)
                : message;
        if (status && msg) {
            return `${status} ${msg}`;
        }
        if (status) {
            return `${status} status code (no body)`;
        }
        if (msg) {
            return msg;
        }
        return '(no status code or body)';
    }
    static generate(status, errorResponse, message, headers) {
        if (!status || !headers) {
            return new APIConnectionError({ message, cause: castToError(errorResponse) });
        }
        const error = errorResponse?.['error'];
        if (status === 400) {
            return new BadRequestError(status, error, message, headers);
        }
        if (status === 401) {
            return new AuthenticationError(status, error, message, headers);
        }
        if (status === 403) {
            return new PermissionDeniedError(status, error, message, headers);
        }
        if (status === 404) {
            return new NotFoundError(status, error, message, headers);
        }
        if (status === 409) {
            return new ConflictError(status, error, message, headers);
        }
        if (status === 422) {
            return new UnprocessableEntityError(status, error, message, headers);
        }
        if (status === 429) {
            return new RateLimitError(status, error, message, headers);
        }
        if (status >= 500) {
            return new InternalServerError(status, error, message, headers);
        }
        return new APIError(status, error, message, headers);
    }
}
class APIUserAbortError extends APIError {
    constructor({ message } = {}) {
        super(undefined, undefined, message || 'Request was aborted.', undefined);
    }
}
class APIConnectionError extends APIError {
    constructor({ message, cause }) {
        super(undefined, undefined, message || 'Connection error.', undefined);
        // in some environments the 'cause' property is already declared
        // @ts-ignore
        if (cause)
            this.cause = cause;
    }
}
class APIConnectionTimeoutError extends APIConnectionError {
    constructor({ message } = {}) {
        super({ message: message ?? 'Request timed out.' });
    }
}
class BadRequestError extends APIError {
}
class AuthenticationError extends APIError {
}
class PermissionDeniedError extends APIError {
}
class NotFoundError extends APIError {
}
class ConflictError extends APIError {
}
class UnprocessableEntityError extends APIError {
}
class RateLimitError extends APIError {
}
class InternalServerError extends APIError {
}
class LengthFinishReasonError extends OpenAIError {
    constructor() {
        super(`Could not parse response content as the length limit was reached`);
    }
}
class ContentFilterFinishReasonError extends OpenAIError {
    constructor() {
        super(`Could not parse response content as the request was rejected by the content filter`);
    }
}

var __classPrivateFieldSet$4 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$5 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _LineDecoder_carriageReturnIndex;
/**
 * A re-implementation of httpx's `LineDecoder` in Python that handles incrementally
 * reading lines from text.
 *
 * https://github.com/encode/httpx/blob/920333ea98118e9cf617f246905d7b202510941c/httpx/_decoders.py#L258
 */
class LineDecoder {
    constructor() {
        _LineDecoder_carriageReturnIndex.set(this, void 0);
        this.buffer = new Uint8Array();
        __classPrivateFieldSet$4(this, _LineDecoder_carriageReturnIndex, null, "f");
    }
    decode(chunk) {
        if (chunk == null) {
            return [];
        }
        const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk)
            : typeof chunk === 'string' ? new TextEncoder().encode(chunk)
                : chunk;
        let newData = new Uint8Array(this.buffer.length + binaryChunk.length);
        newData.set(this.buffer);
        newData.set(binaryChunk, this.buffer.length);
        this.buffer = newData;
        const lines = [];
        let patternIndex;
        while ((patternIndex = findNewlineIndex(this.buffer, __classPrivateFieldGet$5(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
            if (patternIndex.carriage && __classPrivateFieldGet$5(this, _LineDecoder_carriageReturnIndex, "f") == null) {
                // skip until we either get a corresponding `\n`, a new `\r` or nothing
                __classPrivateFieldSet$4(this, _LineDecoder_carriageReturnIndex, patternIndex.index, "f");
                continue;
            }
            // we got double \r or \rtext\n
            if (__classPrivateFieldGet$5(this, _LineDecoder_carriageReturnIndex, "f") != null &&
                (patternIndex.index !== __classPrivateFieldGet$5(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
                lines.push(this.decodeText(this.buffer.slice(0, __classPrivateFieldGet$5(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
                this.buffer = this.buffer.slice(__classPrivateFieldGet$5(this, _LineDecoder_carriageReturnIndex, "f"));
                __classPrivateFieldSet$4(this, _LineDecoder_carriageReturnIndex, null, "f");
                continue;
            }
            const endIndex = __classPrivateFieldGet$5(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
            const line = this.decodeText(this.buffer.slice(0, endIndex));
            lines.push(line);
            this.buffer = this.buffer.slice(patternIndex.index);
            __classPrivateFieldSet$4(this, _LineDecoder_carriageReturnIndex, null, "f");
        }
        return lines;
    }
    decodeText(bytes) {
        if (bytes == null)
            return '';
        if (typeof bytes === 'string')
            return bytes;
        // Node:
        if (typeof Buffer !== 'undefined') {
            if (bytes instanceof Buffer) {
                return bytes.toString();
            }
            if (bytes instanceof Uint8Array) {
                return Buffer.from(bytes).toString();
            }
            throw new OpenAIError(`Unexpected: received non-Uint8Array (${bytes.constructor.name}) stream chunk in an environment with a global "Buffer" defined, which this library assumes to be Node. Please report this error.`);
        }
        // Browser
        if (typeof TextDecoder !== 'undefined') {
            if (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) {
                this.textDecoder ?? (this.textDecoder = new TextDecoder('utf8'));
                return this.textDecoder.decode(bytes);
            }
            throw new OpenAIError(`Unexpected: received non-Uint8Array/ArrayBuffer (${bytes.constructor.name}) in a web platform. Please report this error.`);
        }
        throw new OpenAIError(`Unexpected: neither Buffer nor TextDecoder are available as globals. Please report this error.`);
    }
    flush() {
        if (!this.buffer.length) {
            return [];
        }
        return this.decode('\n');
    }
}
_LineDecoder_carriageReturnIndex = new WeakMap();
// prettier-ignore
LineDecoder.NEWLINE_CHARS = new Set(['\n', '\r']);
LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
/**
 * This function searches the buffer for the end patterns, (\r or \n)
 * and returns an object with the index preceding the matched newline and the
 * index after the newline char. `null` is returned if no new line is found.
 *
 * ```ts
 * findNewLineIndex('abc\ndef') -> { preceding: 2, index: 3 }
 * ```
 */
function findNewlineIndex(buffer, startIndex) {
    const newline = 0x0a; // \n
    const carriage = 0x0d; // \r
    for (let i = startIndex ?? 0; i < buffer.length; i++) {
        if (buffer[i] === newline) {
            return { preceding: i, index: i + 1, carriage: false };
        }
        if (buffer[i] === carriage) {
            return { preceding: i, index: i + 1, carriage: true };
        }
    }
    return null;
}
function findDoubleNewlineIndex(buffer) {
    // This function searches the buffer for the end patterns (\r\r, \n\n, \r\n\r\n)
    // and returns the index right after the first occurrence of any pattern,
    // or -1 if none of the patterns are found.
    const newline = 0x0a; // \n
    const carriage = 0x0d; // \r
    for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i] === newline && buffer[i + 1] === newline) {
            // \n\n
            return i + 2;
        }
        if (buffer[i] === carriage && buffer[i + 1] === carriage) {
            // \r\r
            return i + 2;
        }
        if (buffer[i] === carriage &&
            buffer[i + 1] === newline &&
            i + 3 < buffer.length &&
            buffer[i + 2] === carriage &&
            buffer[i + 3] === newline) {
            // \r\n\r\n
            return i + 4;
        }
    }
    return -1;
}

/**
 * Most browsers don't yet have async iterable support for ReadableStream,
 * and Node has a very different way of reading bytes from its "ReadableStream".
 *
 * This polyfill was pulled from https://github.com/MattiasBuelens/web-streams-polyfill/pull/122#issuecomment-1627354490
 */
function ReadableStreamToAsyncIterable(stream) {
    if (stream[Symbol.asyncIterator])
        return stream;
    const reader = stream.getReader();
    return {
        async next() {
            try {
                const result = await reader.read();
                if (result?.done)
                    reader.releaseLock(); // release lock when stream becomes closed
                return result;
            }
            catch (e) {
                reader.releaseLock(); // release lock when stream becomes errored
                throw e;
            }
        },
        async return() {
            const cancelPromise = reader.cancel();
            reader.releaseLock();
            await cancelPromise;
            return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
            return this;
        },
    };
}

class Stream {
    constructor(iterator, controller) {
        this.iterator = iterator;
        this.controller = controller;
    }
    static fromSSEResponse(response, controller) {
        let consumed = false;
        async function* iterator() {
            if (consumed) {
                throw new Error('Cannot iterate over a consumed stream, use `.tee()` to split the stream.');
            }
            consumed = true;
            let done = false;
            try {
                for await (const sse of _iterSSEMessages(response, controller)) {
                    if (done)
                        continue;
                    if (sse.data.startsWith('[DONE]')) {
                        done = true;
                        continue;
                    }
                    if (sse.event === null) {
                        let data;
                        try {
                            data = JSON.parse(sse.data);
                        }
                        catch (e) {
                            console.error(`Could not parse message into JSON:`, sse.data);
                            console.error(`From chunk:`, sse.raw);
                            throw e;
                        }
                        if (data && data.error) {
                            throw new APIError(undefined, data.error, undefined, undefined);
                        }
                        yield data;
                    }
                    else {
                        let data;
                        try {
                            data = JSON.parse(sse.data);
                        }
                        catch (e) {
                            console.error(`Could not parse message into JSON:`, sse.data);
                            console.error(`From chunk:`, sse.raw);
                            throw e;
                        }
                        // TODO: Is this where the error should be thrown?
                        if (sse.event == 'error') {
                            throw new APIError(undefined, data.error, data.message, undefined);
                        }
                        yield { event: sse.event, data: data };
                    }
                }
                done = true;
            }
            catch (e) {
                // If the user calls `stream.controller.abort()`, we should exit without throwing.
                if (e instanceof Error && e.name === 'AbortError')
                    return;
                throw e;
            }
            finally {
                // If the user `break`s, abort the ongoing request.
                if (!done)
                    controller.abort();
            }
        }
        return new Stream(iterator, controller);
    }
    /**
     * Generates a Stream from a newline-separated ReadableStream
     * where each item is a JSON value.
     */
    static fromReadableStream(readableStream, controller) {
        let consumed = false;
        async function* iterLines() {
            const lineDecoder = new LineDecoder();
            const iter = ReadableStreamToAsyncIterable(readableStream);
            for await (const chunk of iter) {
                for (const line of lineDecoder.decode(chunk)) {
                    yield line;
                }
            }
            for (const line of lineDecoder.flush()) {
                yield line;
            }
        }
        async function* iterator() {
            if (consumed) {
                throw new Error('Cannot iterate over a consumed stream, use `.tee()` to split the stream.');
            }
            consumed = true;
            let done = false;
            try {
                for await (const line of iterLines()) {
                    if (done)
                        continue;
                    if (line)
                        yield JSON.parse(line);
                }
                done = true;
            }
            catch (e) {
                // If the user calls `stream.controller.abort()`, we should exit without throwing.
                if (e instanceof Error && e.name === 'AbortError')
                    return;
                throw e;
            }
            finally {
                // If the user `break`s, abort the ongoing request.
                if (!done)
                    controller.abort();
            }
        }
        return new Stream(iterator, controller);
    }
    [Symbol.asyncIterator]() {
        return this.iterator();
    }
    /**
     * Splits the stream into two streams which can be
     * independently read from at different speeds.
     */
    tee() {
        const left = [];
        const right = [];
        const iterator = this.iterator();
        const teeIterator = (queue) => {
            return {
                next: () => {
                    if (queue.length === 0) {
                        const result = iterator.next();
                        left.push(result);
                        right.push(result);
                    }
                    return queue.shift();
                },
            };
        };
        return [
            new Stream(() => teeIterator(left), this.controller),
            new Stream(() => teeIterator(right), this.controller),
        ];
    }
    /**
     * Converts this stream to a newline-separated ReadableStream of
     * JSON stringified values in the stream
     * which can be turned back into a Stream with `Stream.fromReadableStream()`.
     */
    toReadableStream() {
        const self = this;
        let iter;
        const encoder = new TextEncoder();
        return new ReadableStream$1({
            async start() {
                iter = self[Symbol.asyncIterator]();
            },
            async pull(ctrl) {
                try {
                    const { value, done } = await iter.next();
                    if (done)
                        return ctrl.close();
                    const bytes = encoder.encode(JSON.stringify(value) + '\n');
                    ctrl.enqueue(bytes);
                }
                catch (err) {
                    ctrl.error(err);
                }
            },
            async cancel() {
                await iter.return?.();
            },
        });
    }
}
async function* _iterSSEMessages(response, controller) {
    if (!response.body) {
        controller.abort();
        throw new OpenAIError(`Attempted to iterate over a response with no body`);
    }
    const sseDecoder = new SSEDecoder();
    const lineDecoder = new LineDecoder();
    const iter = ReadableStreamToAsyncIterable(response.body);
    for await (const sseChunk of iterSSEChunks(iter)) {
        for (const line of lineDecoder.decode(sseChunk)) {
            const sse = sseDecoder.decode(line);
            if (sse)
                yield sse;
        }
    }
    for (const line of lineDecoder.flush()) {
        const sse = sseDecoder.decode(line);
        if (sse)
            yield sse;
    }
}
/**
 * Given an async iterable iterator, iterates over it and yields full
 * SSE chunks, i.e. yields when a double new-line is encountered.
 */
async function* iterSSEChunks(iterator) {
    let data = new Uint8Array();
    for await (const chunk of iterator) {
        if (chunk == null) {
            continue;
        }
        const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk)
            : typeof chunk === 'string' ? new TextEncoder().encode(chunk)
                : chunk;
        let newData = new Uint8Array(data.length + binaryChunk.length);
        newData.set(data);
        newData.set(binaryChunk, data.length);
        data = newData;
        let patternIndex;
        while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
            yield data.slice(0, patternIndex);
            data = data.slice(patternIndex);
        }
    }
    if (data.length > 0) {
        yield data;
    }
}
class SSEDecoder {
    constructor() {
        this.event = null;
        this.data = [];
        this.chunks = [];
    }
    decode(line) {
        if (line.endsWith('\r')) {
            line = line.substring(0, line.length - 1);
        }
        if (!line) {
            // empty line and we didn't previously encounter any messages
            if (!this.event && !this.data.length)
                return null;
            const sse = {
                event: this.event,
                data: this.data.join('\n'),
                raw: this.chunks,
            };
            this.event = null;
            this.data = [];
            this.chunks = [];
            return sse;
        }
        this.chunks.push(line);
        if (line.startsWith(':')) {
            return null;
        }
        let [fieldname, _, value] = partition(line, ':');
        if (value.startsWith(' ')) {
            value = value.substring(1);
        }
        if (fieldname === 'event') {
            this.event = value;
        }
        else if (fieldname === 'data') {
            this.data.push(value);
        }
        return null;
    }
}
function partition(str, delimiter) {
    const index = str.indexOf(delimiter);
    if (index !== -1) {
        return [str.substring(0, index), delimiter, str.substring(index + delimiter.length)];
    }
    return [str, '', ''];
}

const isResponseLike = (value) => value != null &&
    typeof value === 'object' &&
    typeof value.url === 'string' &&
    typeof value.blob === 'function';
const isFileLike = (value) => value != null &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    typeof value.lastModified === 'number' &&
    isBlobLike(value);
/**
 * The BlobLike type omits arrayBuffer() because @types/node-fetch@^2.6.4 lacks it; but this check
 * adds the arrayBuffer() method type because it is available and used at runtime
 */
const isBlobLike = (value) => value != null &&
    typeof value === 'object' &&
    typeof value.size === 'number' &&
    typeof value.type === 'string' &&
    typeof value.text === 'function' &&
    typeof value.slice === 'function' &&
    typeof value.arrayBuffer === 'function';
const isUploadable = (value) => {
    return isFileLike(value) || isResponseLike(value) || isFsReadStream(value);
};
/**
 * Helper for creating a {@link File} to pass to an SDK upload method from a variety of different data formats
 * @param value the raw content of the file.  Can be an {@link Uploadable}, {@link BlobLikePart}, or {@link AsyncIterable} of {@link BlobLikePart}s
 * @param {string=} name the name of the file. If omitted, toFile will try to determine a file name from bits if possible
 * @param {Object=} options additional properties
 * @param {string=} options.type the MIME type of the content
 * @param {number=} options.lastModified the last modified timestamp
 * @returns a {@link File} with the given properties
 */
async function toFile(value, name, options) {
    // If it's a promise, resolve it.
    value = await value;
    // If we've been given a `File` we don't need to do anything
    if (isFileLike(value)) {
        return value;
    }
    if (isResponseLike(value)) {
        const blob = await value.blob();
        name || (name = new URL(value.url).pathname.split(/[\\/]/).pop() ?? 'unknown_file');
        // we need to convert the `Blob` into an array buffer because the `Blob` class
        // that `node-fetch` defines is incompatible with the web standard which results
        // in `new File` interpreting it as a string instead of binary data.
        const data = isBlobLike(blob) ? [(await blob.arrayBuffer())] : [blob];
        return new File$1(data, name, options);
    }
    const bits = await getBytes(value);
    name || (name = getName(value) ?? 'unknown_file');
    if (!options?.type) {
        const type = bits[0]?.type;
        if (typeof type === 'string') {
            options = { ...options, type };
        }
    }
    return new File$1(bits, name, options);
}
async function getBytes(value) {
    let parts = [];
    if (typeof value === 'string' ||
        ArrayBuffer.isView(value) || // includes Uint8Array, Buffer, etc.
        value instanceof ArrayBuffer) {
        parts.push(value);
    }
    else if (isBlobLike(value)) {
        parts.push(await value.arrayBuffer());
    }
    else if (isAsyncIterableIterator(value) // includes Readable, ReadableStream, etc.
    ) {
        for await (const chunk of value) {
            parts.push(chunk); // TODO, consider validating?
        }
    }
    else {
        throw new Error(`Unexpected data type: ${typeof value}; constructor: ${value?.constructor
            ?.name}; props: ${propsForError(value)}`);
    }
    return parts;
}
function propsForError(value) {
    const props = Object.getOwnPropertyNames(value);
    return `[${props.map((p) => `"${p}"`).join(', ')}]`;
}
function getName(value) {
    return (getStringFromMaybeBuffer(value.name) ||
        getStringFromMaybeBuffer(value.filename) ||
        // For fs.ReadStream
        getStringFromMaybeBuffer(value.path)?.split(/[\\/]/).pop());
}
const getStringFromMaybeBuffer = (x) => {
    if (typeof x === 'string')
        return x;
    if (typeof Buffer !== 'undefined' && x instanceof Buffer)
        return String(x);
    return undefined;
};
const isAsyncIterableIterator = (value) => value != null && typeof value === 'object' && typeof value[Symbol.asyncIterator] === 'function';
const isMultipartBody = (body) => body && typeof body === 'object' && body.body && body[Symbol.toStringTag] === 'MultipartBody';
const multipartFormRequestOptions = async (opts) => {
    const form = await createForm(opts.body);
    return getMultipartRequestOptions(form, opts);
};
const createForm = async (body) => {
    const form = new FormData$1();
    await Promise.all(Object.entries(body || {}).map(([key, value]) => addFormValue(form, key, value)));
    return form;
};
const addFormValue = async (form, key, value) => {
    if (value === undefined)
        return;
    if (value == null) {
        throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
    }
    // TODO: make nested formats configurable
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        form.append(key, String(value));
    }
    else if (isUploadable(value)) {
        const file = await toFile(value);
        form.append(key, file);
    }
    else if (Array.isArray(value)) {
        await Promise.all(value.map((entry) => addFormValue(form, key + '[]', entry)));
    }
    else if (typeof value === 'object') {
        await Promise.all(Object.entries(value).map(([name, prop]) => addFormValue(form, `${key}[${name}]`, prop)));
    }
    else {
        throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
    }
};

var __classPrivateFieldSet$3 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$4 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _AbstractPage_client;
async function defaultParseResponse(props) {
    const { response } = props;
    if (props.options.stream) {
        debug('response', response.status, response.url, response.headers, response.body);
        // Note: there is an invariant here that isn't represented in the type system
        // that if you set `stream: true` the response type must also be `Stream<T>`
        if (props.options.__streamClass) {
            return props.options.__streamClass.fromSSEResponse(response, props.controller);
        }
        return Stream.fromSSEResponse(response, props.controller);
    }
    // fetch refuses to read the body when the status code is 204.
    if (response.status === 204) {
        return null;
    }
    if (props.options.__binaryResponse) {
        return response;
    }
    const contentType = response.headers.get('content-type');
    const isJSON = contentType?.includes('application/json') || contentType?.includes('application/vnd.api+json');
    if (isJSON) {
        const json = await response.json();
        debug('response', response.status, response.url, response.headers, json);
        return _addRequestID(json, response);
    }
    const text = await response.text();
    debug('response', response.status, response.url, response.headers, text);
    // TODO handle blob, arraybuffer, other content types, etc.
    return text;
}
function _addRequestID(value, response) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }
    return Object.defineProperty(value, '_request_id', {
        value: response.headers.get('x-request-id'),
        enumerable: false,
    });
}
/**
 * A subclass of `Promise` providing additional helper methods
 * for interacting with the SDK.
 */
class APIPromise extends Promise {
    constructor(responsePromise, parseResponse = defaultParseResponse) {
        super((resolve) => {
            // this is maybe a bit weird but this has to be a no-op to not implicitly
            // parse the response body; instead .then, .catch, .finally are overridden
            // to parse the response
            resolve(null);
        });
        this.responsePromise = responsePromise;
        this.parseResponse = parseResponse;
    }
    _thenUnwrap(transform) {
        return new APIPromise(this.responsePromise, async (props) => _addRequestID(transform(await this.parseResponse(props), props), props.response));
    }
    /**
     * Gets the raw `Response` instance instead of parsing the response
     * data.
     *
     * If you want to parse the response body but still get the `Response`
     * instance, you can use {@link withResponse()}.
     *
     * 👋 Getting the wrong TypeScript type for `Response`?
     * Try setting `"moduleResolution": "NodeNext"` if you can,
     * or add one of these imports before your first `import … from 'openai'`:
     * - `import 'openai/shims/node'` (if you're running on Node)
     * - `import 'openai/shims/web'` (otherwise)
     */
    asResponse() {
        return this.responsePromise.then((p) => p.response);
    }
    /**
     * Gets the parsed response data, the raw `Response` instance and the ID of the request,
     * returned via the X-Request-ID header which is useful for debugging requests and reporting
     * issues to OpenAI.
     *
     * If you just want to get the raw `Response` instance without parsing it,
     * you can use {@link asResponse()}.
     *
     *
     * 👋 Getting the wrong TypeScript type for `Response`?
     * Try setting `"moduleResolution": "NodeNext"` if you can,
     * or add one of these imports before your first `import … from 'openai'`:
     * - `import 'openai/shims/node'` (if you're running on Node)
     * - `import 'openai/shims/web'` (otherwise)
     */
    async withResponse() {
        const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
        return { data, response, request_id: response.headers.get('x-request-id') };
    }
    parse() {
        if (!this.parsedPromise) {
            this.parsedPromise = this.responsePromise.then(this.parseResponse);
        }
        return this.parsedPromise;
    }
    then(onfulfilled, onrejected) {
        return this.parse().then(onfulfilled, onrejected);
    }
    catch(onrejected) {
        return this.parse().catch(onrejected);
    }
    finally(onfinally) {
        return this.parse().finally(onfinally);
    }
}
class APIClient {
    constructor({ baseURL, maxRetries = 2, timeout = 600000, // 10 minutes
    httpAgent, fetch: overriddenFetch, }) {
        this.baseURL = baseURL;
        this.maxRetries = validatePositiveInteger('maxRetries', maxRetries);
        this.timeout = validatePositiveInteger('timeout', timeout);
        this.httpAgent = httpAgent;
        this.fetch = overriddenFetch ?? fetch$1;
    }
    authHeaders(opts) {
        return {};
    }
    /**
     * Override this to add your own default headers, for example:
     *
     *  {
     *    ...super.defaultHeaders(),
     *    Authorization: 'Bearer 123',
     *  }
     */
    defaultHeaders(opts) {
        return {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': this.getUserAgent(),
            ...getPlatformHeaders(),
            ...this.authHeaders(opts),
        };
    }
    /**
     * Override this to add your own headers validation:
     */
    validateHeaders(headers, customHeaders) { }
    defaultIdempotencyKey() {
        return `stainless-node-retry-${uuid4()}`;
    }
    get(path, opts) {
        return this.methodRequest('get', path, opts);
    }
    post(path, opts) {
        return this.methodRequest('post', path, opts);
    }
    patch(path, opts) {
        return this.methodRequest('patch', path, opts);
    }
    put(path, opts) {
        return this.methodRequest('put', path, opts);
    }
    delete(path, opts) {
        return this.methodRequest('delete', path, opts);
    }
    methodRequest(method, path, opts) {
        return this.request(Promise.resolve(opts).then(async (opts) => {
            const body = opts && isBlobLike(opts?.body) ? new DataView(await opts.body.arrayBuffer())
                : opts?.body instanceof DataView ? opts.body
                    : opts?.body instanceof ArrayBuffer ? new DataView(opts.body)
                        : opts && ArrayBuffer.isView(opts?.body) ? new DataView(opts.body.buffer)
                            : opts?.body;
            return { method, path, ...opts, body };
        }));
    }
    getAPIList(path, Page, opts) {
        return this.requestAPIList(Page, { method: 'get', path, ...opts });
    }
    calculateContentLength(body) {
        if (typeof body === 'string') {
            if (typeof Buffer !== 'undefined') {
                return Buffer.byteLength(body, 'utf8').toString();
            }
            if (typeof TextEncoder !== 'undefined') {
                const encoder = new TextEncoder();
                const encoded = encoder.encode(body);
                return encoded.length.toString();
            }
        }
        else if (ArrayBuffer.isView(body)) {
            return body.byteLength.toString();
        }
        return null;
    }
    buildRequest(options, { retryCount = 0 } = {}) {
        options = { ...options };
        const { method, path, query, headers: headers = {} } = options;
        const body = ArrayBuffer.isView(options.body) || (options.__binaryRequest && typeof options.body === 'string') ?
            options.body
            : isMultipartBody(options.body) ? options.body.body
                : options.body ? JSON.stringify(options.body, null, 2)
                    : null;
        const contentLength = this.calculateContentLength(body);
        const url = this.buildURL(path, query);
        if ('timeout' in options)
            validatePositiveInteger('timeout', options.timeout);
        options.timeout = options.timeout ?? this.timeout;
        const httpAgent = options.httpAgent ?? this.httpAgent ?? getDefaultAgent(url);
        const minAgentTimeout = options.timeout + 1000;
        if (typeof httpAgent?.options?.timeout === 'number' &&
            minAgentTimeout > (httpAgent.options.timeout ?? 0)) {
            // Allow any given request to bump our agent active socket timeout.
            // This may seem strange, but leaking active sockets should be rare and not particularly problematic,
            // and without mutating agent we would need to create more of them.
            // This tradeoff optimizes for performance.
            httpAgent.options.timeout = minAgentTimeout;
        }
        if (this.idempotencyHeader && method !== 'get') {
            if (!options.idempotencyKey)
                options.idempotencyKey = this.defaultIdempotencyKey();
            headers[this.idempotencyHeader] = options.idempotencyKey;
        }
        const reqHeaders = this.buildHeaders({ options, headers, contentLength, retryCount });
        const req = {
            method,
            ...(body && { body: body }),
            headers: reqHeaders,
            ...(httpAgent && { agent: httpAgent }),
            // @ts-ignore node-fetch uses a custom AbortSignal type that is
            // not compatible with standard web types
            signal: options.signal ?? null,
        };
        return { req, url, timeout: options.timeout };
    }
    buildHeaders({ options, headers, contentLength, retryCount, }) {
        const reqHeaders = {};
        if (contentLength) {
            reqHeaders['content-length'] = contentLength;
        }
        const defaultHeaders = this.defaultHeaders(options);
        applyHeadersMut(reqHeaders, defaultHeaders);
        applyHeadersMut(reqHeaders, headers);
        // let builtin fetch set the Content-Type for multipart bodies
        if (isMultipartBody(options.body) && kind !== 'node') {
            delete reqHeaders['content-type'];
        }
        // Don't set theses headers if they were already set or removed through default headers or by the caller.
        // We check `defaultHeaders` and `headers`, which can contain nulls, instead of `reqHeaders` to account
        // for the removal case.
        if (getHeader(defaultHeaders, 'x-stainless-retry-count') === undefined &&
            getHeader(headers, 'x-stainless-retry-count') === undefined) {
            reqHeaders['x-stainless-retry-count'] = String(retryCount);
        }
        if (getHeader(defaultHeaders, 'x-stainless-timeout') === undefined &&
            getHeader(headers, 'x-stainless-timeout') === undefined &&
            options.timeout) {
            reqHeaders['x-stainless-timeout'] = String(options.timeout);
        }
        this.validateHeaders(reqHeaders, headers);
        return reqHeaders;
    }
    /**
     * Used as a callback for mutating the given `FinalRequestOptions` object.
     */
    async prepareOptions(options) { }
    /**
     * Used as a callback for mutating the given `RequestInit` object.
     *
     * This is useful for cases where you want to add certain headers based off of
     * the request properties, e.g. `method` or `url`.
     */
    async prepareRequest(request, { url, options }) { }
    parseHeaders(headers) {
        return (!headers ? {}
            : Symbol.iterator in headers ?
                Object.fromEntries(Array.from(headers).map((header) => [...header]))
                : { ...headers });
    }
    makeStatusError(status, error, message, headers) {
        return APIError.generate(status, error, message, headers);
    }
    request(options, remainingRetries = null) {
        return new APIPromise(this.makeRequest(options, remainingRetries));
    }
    async makeRequest(optionsInput, retriesRemaining) {
        const options = await optionsInput;
        const maxRetries = options.maxRetries ?? this.maxRetries;
        if (retriesRemaining == null) {
            retriesRemaining = maxRetries;
        }
        await this.prepareOptions(options);
        const { req, url, timeout } = this.buildRequest(options, { retryCount: maxRetries - retriesRemaining });
        await this.prepareRequest(req, { url, options });
        debug('request', url, options, req.headers);
        if (options.signal?.aborted) {
            throw new APIUserAbortError();
        }
        const controller = new AbortController();
        const response = await this.fetchWithTimeout(url, req, timeout, controller).catch(castToError);
        if (response instanceof Error) {
            if (options.signal?.aborted) {
                throw new APIUserAbortError();
            }
            if (retriesRemaining) {
                return this.retryRequest(options, retriesRemaining);
            }
            if (response.name === 'AbortError') {
                throw new APIConnectionTimeoutError();
            }
            throw new APIConnectionError({ cause: response });
        }
        const responseHeaders = createResponseHeaders(response.headers);
        if (!response.ok) {
            if (retriesRemaining && this.shouldRetry(response)) {
                const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
                debug(`response (error; ${retryMessage})`, response.status, url, responseHeaders);
                return this.retryRequest(options, retriesRemaining, responseHeaders);
            }
            const errText = await response.text().catch((e) => castToError(e).message);
            const errJSON = safeJSON(errText);
            const errMessage = errJSON ? undefined : errText;
            const retryMessage = retriesRemaining ? `(error; no more retries left)` : `(error; not retryable)`;
            debug(`response (error; ${retryMessage})`, response.status, url, responseHeaders, errMessage);
            const err = this.makeStatusError(response.status, errJSON, errMessage, responseHeaders);
            throw err;
        }
        return { response, options, controller };
    }
    requestAPIList(Page, options) {
        const request = this.makeRequest(options, null);
        return new PagePromise(this, request, Page);
    }
    buildURL(path, query) {
        const url = isAbsoluteURL(path) ?
            new URL(path)
            : new URL(this.baseURL + (this.baseURL.endsWith('/') && path.startsWith('/') ? path.slice(1) : path));
        const defaultQuery = this.defaultQuery();
        if (!isEmptyObj(defaultQuery)) {
            query = { ...defaultQuery, ...query };
        }
        if (typeof query === 'object' && query && !Array.isArray(query)) {
            url.search = this.stringifyQuery(query);
        }
        return url.toString();
    }
    stringifyQuery(query) {
        return Object.entries(query)
            .filter(([_, value]) => typeof value !== 'undefined')
            .map(([key, value]) => {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            }
            if (value === null) {
                return `${encodeURIComponent(key)}=`;
            }
            throw new OpenAIError(`Cannot stringify type ${typeof value}; Expected string, number, boolean, or null. If you need to pass nested query parameters, you can manually encode them, e.g. { query: { 'foo[key1]': value1, 'foo[key2]': value2 } }, and please open a GitHub issue requesting better support for your use case.`);
        })
            .join('&');
    }
    async fetchWithTimeout(url, init, ms, controller) {
        const { signal, ...options } = init || {};
        if (signal)
            signal.addEventListener('abort', () => controller.abort());
        const timeout = setTimeout(() => controller.abort(), ms);
        const fetchOptions = {
            signal: controller.signal,
            ...options,
        };
        if (fetchOptions.method) {
            // Custom methods like 'patch' need to be uppercased
            // See https://github.com/nodejs/undici/issues/2294
            fetchOptions.method = fetchOptions.method.toUpperCase();
        }
        return (
        // use undefined this binding; fetch errors if bound to something else in browser/cloudflare
        this.fetch.call(undefined, url, fetchOptions).finally(() => {
            clearTimeout(timeout);
        }));
    }
    shouldRetry(response) {
        // Note this is not a standard header.
        const shouldRetryHeader = response.headers.get('x-should-retry');
        // If the server explicitly says whether or not to retry, obey.
        if (shouldRetryHeader === 'true')
            return true;
        if (shouldRetryHeader === 'false')
            return false;
        // Retry on request timeouts.
        if (response.status === 408)
            return true;
        // Retry on lock timeouts.
        if (response.status === 409)
            return true;
        // Retry on rate limits.
        if (response.status === 429)
            return true;
        // Retry internal errors.
        if (response.status >= 500)
            return true;
        return false;
    }
    async retryRequest(options, retriesRemaining, responseHeaders) {
        let timeoutMillis;
        // Note the `retry-after-ms` header may not be standard, but is a good idea and we'd like proactive support for it.
        const retryAfterMillisHeader = responseHeaders?.['retry-after-ms'];
        if (retryAfterMillisHeader) {
            const timeoutMs = parseFloat(retryAfterMillisHeader);
            if (!Number.isNaN(timeoutMs)) {
                timeoutMillis = timeoutMs;
            }
        }
        // About the Retry-After header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
        const retryAfterHeader = responseHeaders?.['retry-after'];
        if (retryAfterHeader && !timeoutMillis) {
            const timeoutSeconds = parseFloat(retryAfterHeader);
            if (!Number.isNaN(timeoutSeconds)) {
                timeoutMillis = timeoutSeconds * 1000;
            }
            else {
                timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
            }
        }
        // If the API asks us to wait a certain amount of time (and it's a reasonable amount),
        // just do what it says, but otherwise calculate a default
        if (!(timeoutMillis && 0 <= timeoutMillis && timeoutMillis < 60 * 1000)) {
            const maxRetries = options.maxRetries ?? this.maxRetries;
            timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
        }
        await sleep(timeoutMillis);
        return this.makeRequest(options, retriesRemaining - 1);
    }
    calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
        const initialRetryDelay = 0.5;
        const maxRetryDelay = 8.0;
        const numRetries = maxRetries - retriesRemaining;
        // Apply exponential backoff, but not more than the max.
        const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
        // Apply some jitter, take up to at most 25 percent of the retry time.
        const jitter = 1 - Math.random() * 0.25;
        return sleepSeconds * jitter * 1000;
    }
    getUserAgent() {
        return `${this.constructor.name}/JS ${VERSION}`;
    }
}
class AbstractPage {
    constructor(client, response, body, options) {
        _AbstractPage_client.set(this, void 0);
        __classPrivateFieldSet$3(this, _AbstractPage_client, client, "f");
        this.options = options;
        this.response = response;
        this.body = body;
    }
    hasNextPage() {
        const items = this.getPaginatedItems();
        if (!items.length)
            return false;
        return this.nextPageInfo() != null;
    }
    async getNextPage() {
        const nextInfo = this.nextPageInfo();
        if (!nextInfo) {
            throw new OpenAIError('No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.');
        }
        const nextOptions = { ...this.options };
        if ('params' in nextInfo && typeof nextOptions.query === 'object') {
            nextOptions.query = { ...nextOptions.query, ...nextInfo.params };
        }
        else if ('url' in nextInfo) {
            const params = [...Object.entries(nextOptions.query || {}), ...nextInfo.url.searchParams.entries()];
            for (const [key, value] of params) {
                nextInfo.url.searchParams.set(key, value);
            }
            nextOptions.query = undefined;
            nextOptions.path = nextInfo.url.toString();
        }
        return await __classPrivateFieldGet$4(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
    }
    async *iterPages() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let page = this;
        yield page;
        while (page.hasNextPage()) {
            page = await page.getNextPage();
            yield page;
        }
    }
    async *[(_AbstractPage_client = new WeakMap(), Symbol.asyncIterator)]() {
        for await (const page of this.iterPages()) {
            for (const item of page.getPaginatedItems()) {
                yield item;
            }
        }
    }
}
/**
 * This subclass of Promise will resolve to an instantiated Page once the request completes.
 *
 * It also implements AsyncIterable to allow auto-paginating iteration on an unawaited list call, eg:
 *
 *    for await (const item of client.items.list()) {
 *      console.log(item)
 *    }
 */
class PagePromise extends APIPromise {
    constructor(client, request, Page) {
        super(request, async (props) => new Page(client, props.response, await defaultParseResponse(props), props.options));
    }
    /**
     * Allow auto-paginating iteration on an unawaited list call, eg:
     *
     *    for await (const item of client.items.list()) {
     *      console.log(item)
     *    }
     */
    async *[Symbol.asyncIterator]() {
        const page = await this;
        for await (const item of page) {
            yield item;
        }
    }
}
const createResponseHeaders = (headers) => {
    return new Proxy(Object.fromEntries(
    // @ts-ignore
    headers.entries()), {
        get(target, name) {
            const key = name.toString();
            return target[key.toLowerCase()] || target[key];
        },
    });
};
// This is required so that we can determine if a given object matches the RequestOptions
// type at runtime. While this requires duplication, it is enforced by the TypeScript
// compiler such that any missing / extraneous keys will cause an error.
const requestOptionsKeys = {
    method: true,
    path: true,
    query: true,
    body: true,
    headers: true,
    maxRetries: true,
    stream: true,
    timeout: true,
    httpAgent: true,
    signal: true,
    idempotencyKey: true,
    __metadata: true,
    __binaryRequest: true,
    __binaryResponse: true,
    __streamClass: true,
};
const isRequestOptions = (obj) => {
    return (typeof obj === 'object' &&
        obj !== null &&
        !isEmptyObj(obj) &&
        Object.keys(obj).every((k) => hasOwn(requestOptionsKeys, k)));
};
const getPlatformProperties = () => {
    if (typeof Deno !== 'undefined' && Deno.build != null) {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION,
            'X-Stainless-OS': normalizePlatform(Deno.build.os),
            'X-Stainless-Arch': normalizeArch(Deno.build.arch),
            'X-Stainless-Runtime': 'deno',
            'X-Stainless-Runtime-Version': typeof Deno.version === 'string' ? Deno.version : Deno.version?.deno ?? 'unknown',
        };
    }
    if (typeof EdgeRuntime !== 'undefined') {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION,
            'X-Stainless-OS': 'Unknown',
            'X-Stainless-Arch': `other:${EdgeRuntime}`,
            'X-Stainless-Runtime': 'edge',
            'X-Stainless-Runtime-Version': process.version,
        };
    }
    // Check if Node.js
    if (Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]') {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION,
            'X-Stainless-OS': normalizePlatform(process.platform),
            'X-Stainless-Arch': normalizeArch(process.arch),
            'X-Stainless-Runtime': 'node',
            'X-Stainless-Runtime-Version': process.version,
        };
    }
    const browserInfo = getBrowserInfo();
    if (browserInfo) {
        return {
            'X-Stainless-Lang': 'js',
            'X-Stainless-Package-Version': VERSION,
            'X-Stainless-OS': 'Unknown',
            'X-Stainless-Arch': 'unknown',
            'X-Stainless-Runtime': `browser:${browserInfo.browser}`,
            'X-Stainless-Runtime-Version': browserInfo.version,
        };
    }
    // TODO add support for Cloudflare workers, etc.
    return {
        'X-Stainless-Lang': 'js',
        'X-Stainless-Package-Version': VERSION,
        'X-Stainless-OS': 'Unknown',
        'X-Stainless-Arch': 'unknown',
        'X-Stainless-Runtime': 'unknown',
        'X-Stainless-Runtime-Version': 'unknown',
    };
};
// Note: modified from https://github.com/JS-DevTools/host-environment/blob/b1ab79ecde37db5d6e163c050e54fe7d287d7c92/src/isomorphic.browser.ts
function getBrowserInfo() {
    if (typeof navigator === 'undefined' || !navigator) {
        return null;
    }
    // NOTE: The order matters here!
    const browserPatterns = [
        { key: 'edge', pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'ie', pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'ie', pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'chrome', pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'firefox', pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
        { key: 'safari', pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ },
    ];
    // Find the FIRST matching browser
    for (const { key, pattern } of browserPatterns) {
        const match = pattern.exec(navigator.userAgent);
        if (match) {
            const major = match[1] || 0;
            const minor = match[2] || 0;
            const patch = match[3] || 0;
            return { browser: key, version: `${major}.${minor}.${patch}` };
        }
    }
    return null;
}
const normalizeArch = (arch) => {
    // Node docs:
    // - https://nodejs.org/api/process.html#processarch
    // Deno docs:
    // - https://doc.deno.land/deno/stable/~/Deno.build
    if (arch === 'x32')
        return 'x32';
    if (arch === 'x86_64' || arch === 'x64')
        return 'x64';
    if (arch === 'arm')
        return 'arm';
    if (arch === 'aarch64' || arch === 'arm64')
        return 'arm64';
    if (arch)
        return `other:${arch}`;
    return 'unknown';
};
const normalizePlatform = (platform) => {
    // Node platforms:
    // - https://nodejs.org/api/process.html#processplatform
    // Deno platforms:
    // - https://doc.deno.land/deno/stable/~/Deno.build
    // - https://github.com/denoland/deno/issues/14799
    platform = platform.toLowerCase();
    // NOTE: this iOS check is untested and may not work
    // Node does not work natively on IOS, there is a fork at
    // https://github.com/nodejs-mobile/nodejs-mobile
    // however it is unknown at the time of writing how to detect if it is running
    if (platform.includes('ios'))
        return 'iOS';
    if (platform === 'android')
        return 'Android';
    if (platform === 'darwin')
        return 'MacOS';
    if (platform === 'win32')
        return 'Windows';
    if (platform === 'freebsd')
        return 'FreeBSD';
    if (platform === 'openbsd')
        return 'OpenBSD';
    if (platform === 'linux')
        return 'Linux';
    if (platform)
        return `Other:${platform}`;
    return 'Unknown';
};
let _platformHeaders;
const getPlatformHeaders = () => {
    return (_platformHeaders ?? (_platformHeaders = getPlatformProperties()));
};
const safeJSON = (text) => {
    try {
        return JSON.parse(text);
    }
    catch (err) {
        return undefined;
    }
};
// https://url.spec.whatwg.org/#url-scheme-string
const startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
const isAbsoluteURL = (url) => {
    return startsWithSchemeRegexp.test(url);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validatePositiveInteger = (name, n) => {
    if (typeof n !== 'number' || !Number.isInteger(n)) {
        throw new OpenAIError(`${name} must be an integer`);
    }
    if (n < 0) {
        throw new OpenAIError(`${name} must be a positive integer`);
    }
    return n;
};
const castToError = (err) => {
    if (err instanceof Error)
        return err;
    if (typeof err === 'object' && err !== null) {
        try {
            return new Error(JSON.stringify(err));
        }
        catch { }
    }
    return new Error(err);
};
/**
 * Read an environment variable.
 *
 * Trims beginning and trailing whitespace.
 *
 * Will return undefined if the environment variable doesn't exist or cannot be accessed.
 */
const readEnv = (env) => {
    if (typeof process !== 'undefined') {
        return process.env?.[env]?.trim() ?? undefined;
    }
    if (typeof Deno !== 'undefined') {
        return Deno.env?.get?.(env)?.trim();
    }
    return undefined;
};
// https://stackoverflow.com/a/34491287
function isEmptyObj(obj) {
    if (!obj)
        return true;
    for (const _k in obj)
        return false;
    return true;
}
// https://eslint.org/docs/latest/rules/no-prototype-builtins
function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
/**
 * Copies headers from "newHeaders" onto "targetHeaders",
 * using lower-case for all properties,
 * ignoring any keys with undefined values,
 * and deleting any keys with null values.
 */
function applyHeadersMut(targetHeaders, newHeaders) {
    for (const k in newHeaders) {
        if (!hasOwn(newHeaders, k))
            continue;
        const lowerKey = k.toLowerCase();
        if (!lowerKey)
            continue;
        const val = newHeaders[k];
        if (val === null) {
            delete targetHeaders[lowerKey];
        }
        else if (val !== undefined) {
            targetHeaders[lowerKey] = val;
        }
    }
}
const SENSITIVE_HEADERS = new Set(['authorization', 'api-key']);
function debug(action, ...args) {
    if (typeof process !== 'undefined' && process?.env?.['DEBUG'] === 'true') {
        const modifiedArgs = args.map((arg) => {
            if (!arg) {
                return arg;
            }
            // Check for sensitive headers in request body 'headers' object
            if (arg['headers']) {
                // clone so we don't mutate
                const modifiedArg = { ...arg, headers: { ...arg['headers'] } };
                for (const header in arg['headers']) {
                    if (SENSITIVE_HEADERS.has(header.toLowerCase())) {
                        modifiedArg['headers'][header] = 'REDACTED';
                    }
                }
                return modifiedArg;
            }
            let modifiedArg = null;
            // Check for sensitive headers in headers object
            for (const header in arg) {
                if (SENSITIVE_HEADERS.has(header.toLowerCase())) {
                    // avoid making a copy until we need to
                    modifiedArg ?? (modifiedArg = { ...arg });
                    modifiedArg[header] = 'REDACTED';
                }
            }
            return modifiedArg ?? arg;
        });
        console.log(`OpenAI:DEBUG:${action}`, ...modifiedArgs);
    }
}
/**
 * https://stackoverflow.com/a/2117523
 */
const uuid4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};
const isRunningInBrowser = () => {
    return (
    // @ts-ignore
    typeof window !== 'undefined' &&
        // @ts-ignore
        typeof window.document !== 'undefined' &&
        // @ts-ignore
        typeof navigator !== 'undefined');
};
const isHeadersProtocol = (headers) => {
    return typeof headers?.get === 'function';
};
const getHeader = (headers, header) => {
    const lowerCasedHeader = header.toLowerCase();
    if (isHeadersProtocol(headers)) {
        // to deal with the case where the header looks like Stainless-Event-Id
        const intercapsHeader = header[0]?.toUpperCase() +
            header.substring(1).replace(/([^\w])(\w)/g, (_m, g1, g2) => g1 + g2.toUpperCase());
        for (const key of [header, lowerCasedHeader, header.toUpperCase(), intercapsHeader]) {
            const value = headers.get(key);
            if (value) {
                return value;
            }
        }
    }
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerCasedHeader) {
            if (Array.isArray(value)) {
                if (value.length <= 1)
                    return value[0];
                console.warn(`Received ${value.length} entries for the ${header} header, using the first entry.`);
                return value[0];
            }
            return value;
        }
    }
    return undefined;
};
function isObj(obj) {
    return obj != null && typeof obj === 'object' && !Array.isArray(obj);
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
/**
 * Note: no pagination actually occurs yet, this is for forwards-compatibility.
 */
class Page extends AbstractPage {
    constructor(client, response, body, options) {
        super(client, response, body, options);
        this.data = body.data || [];
        this.object = body.object;
    }
    getPaginatedItems() {
        return this.data ?? [];
    }
    // @deprecated Please use `nextPageInfo()` instead
    /**
     * This page represents a response that isn't actually paginated at the API level
     * so there will never be any next page params.
     */
    nextPageParams() {
        return null;
    }
    nextPageInfo() {
        return null;
    }
}
class CursorPage extends AbstractPage {
    constructor(client, response, body, options) {
        super(client, response, body, options);
        this.data = body.data || [];
        this.has_more = body.has_more || false;
    }
    getPaginatedItems() {
        return this.data ?? [];
    }
    hasNextPage() {
        if (this.has_more === false) {
            return false;
        }
        return super.hasNextPage();
    }
    // @deprecated Please use `nextPageInfo()` instead
    nextPageParams() {
        const info = this.nextPageInfo();
        if (!info)
            return null;
        if ('params' in info)
            return info.params;
        const params = Object.fromEntries(info.url.searchParams);
        if (!Object.keys(params).length)
            return null;
        return params;
    }
    nextPageInfo() {
        const data = this.getPaginatedItems();
        if (!data.length) {
            return null;
        }
        const id = data[data.length - 1]?.id;
        if (!id) {
            return null;
        }
        return { params: { after: id } };
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class APIResource {
    constructor(client) {
        this._client = client;
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Messages$1 = class Messages extends APIResource {
    list(completionId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list(completionId, {}, query);
        }
        return this._client.getAPIList(`/chat/completions/${completionId}/messages`, ChatCompletionStoreMessagesPage, { query, ...options });
    }
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Completions$2 = class Completions extends APIResource {
    constructor() {
        super(...arguments);
        this.messages = new Messages$1(this._client);
    }
    create(body, options) {
        return this._client.post('/chat/completions', { body, ...options, stream: body.stream ?? false });
    }
    /**
     * Get a stored chat completion. Only chat completions that have been created with
     * the `store` parameter set to `true` will be returned.
     */
    retrieve(completionId, options) {
        return this._client.get(`/chat/completions/${completionId}`, options);
    }
    /**
     * Modify a stored chat completion. Only chat completions that have been created
     * with the `store` parameter set to `true` can be modified. Currently, the only
     * supported modification is to update the `metadata` field.
     */
    update(completionId, body, options) {
        return this._client.post(`/chat/completions/${completionId}`, { body, ...options });
    }
    list(query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/chat/completions', ChatCompletionsPage, { query, ...options });
    }
    /**
     * Delete a stored chat completion. Only chat completions that have been created
     * with the `store` parameter set to `true` can be deleted.
     */
    del(completionId, options) {
        return this._client.delete(`/chat/completions/${completionId}`, options);
    }
};
class ChatCompletionsPage extends CursorPage {
}
class ChatCompletionStoreMessagesPage extends CursorPage {
}
Completions$2.ChatCompletionsPage = ChatCompletionsPage;
Completions$2.Messages = Messages$1;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Chat$1 = class Chat extends APIResource {
    constructor() {
        super(...arguments);
        this.completions = new Completions$2(this._client);
    }
};
Chat$1.Completions = Completions$2;
Chat$1.ChatCompletionsPage = ChatCompletionsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Speech extends APIResource {
    /**
     * Generates audio from the input text.
     */
    create(body, options) {
        return this._client.post('/audio/speech', {
            body,
            ...options,
            headers: { Accept: 'application/octet-stream', ...options?.headers },
            __binaryResponse: true,
        });
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Transcriptions extends APIResource {
    create(body, options) {
        return this._client.post('/audio/transcriptions', multipartFormRequestOptions({ body, ...options, __metadata: { model: body.model } }));
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Translations extends APIResource {
    create(body, options) {
        return this._client.post('/audio/translations', multipartFormRequestOptions({ body, ...options, __metadata: { model: body.model } }));
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Audio extends APIResource {
    constructor() {
        super(...arguments);
        this.transcriptions = new Transcriptions(this._client);
        this.translations = new Translations(this._client);
        this.speech = new Speech(this._client);
    }
}
Audio.Transcriptions = Transcriptions;
Audio.Translations = Translations;
Audio.Speech = Speech;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Batches extends APIResource {
    /**
     * Creates and executes a batch from an uploaded file of requests
     */
    create(body, options) {
        return this._client.post('/batches', { body, ...options });
    }
    /**
     * Retrieves a batch.
     */
    retrieve(batchId, options) {
        return this._client.get(`/batches/${batchId}`, options);
    }
    list(query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/batches', BatchesPage, { query, ...options });
    }
    /**
     * Cancels an in-progress batch. The batch will be in status `cancelling` for up to
     * 10 minutes, before changing to `cancelled`, where it will have partial results
     * (if any) available in the output file.
     */
    cancel(batchId, options) {
        return this._client.post(`/batches/${batchId}/cancel`, options);
    }
}
class BatchesPage extends CursorPage {
}
Batches.BatchesPage = BatchesPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Assistants extends APIResource {
    /**
     * Create an assistant with a model and instructions.
     */
    create(body, options) {
        return this._client.post('/assistants', {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Retrieves an assistant.
     */
    retrieve(assistantId, options) {
        return this._client.get(`/assistants/${assistantId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Modifies an assistant.
     */
    update(assistantId, body, options) {
        return this._client.post(`/assistants/${assistantId}`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    list(query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/assistants', AssistantsPage, {
            query,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Delete an assistant.
     */
    del(assistantId, options) {
        return this._client.delete(`/assistants/${assistantId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
}
class AssistantsPage extends CursorPage {
}
Assistants.AssistantsPage = AssistantsPage;

function isRunnableFunctionWithParse(fn) {
    return typeof fn.parse === 'function';
}

const isAssistantMessage = (message) => {
    return message?.role === 'assistant';
};
const isFunctionMessage = (message) => {
    return message?.role === 'function';
};
const isToolMessage = (message) => {
    return message?.role === 'tool';
};

var __classPrivateFieldSet$2 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$3 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _EventStream_instances, _EventStream_connectedPromise, _EventStream_resolveConnectedPromise, _EventStream_rejectConnectedPromise, _EventStream_endPromise, _EventStream_resolveEndPromise, _EventStream_rejectEndPromise, _EventStream_listeners, _EventStream_ended, _EventStream_errored, _EventStream_aborted, _EventStream_catchingPromiseCreated, _EventStream_handleError;
class EventStream {
    constructor() {
        _EventStream_instances.add(this);
        this.controller = new AbortController();
        _EventStream_connectedPromise.set(this, void 0);
        _EventStream_resolveConnectedPromise.set(this, () => { });
        _EventStream_rejectConnectedPromise.set(this, () => { });
        _EventStream_endPromise.set(this, void 0);
        _EventStream_resolveEndPromise.set(this, () => { });
        _EventStream_rejectEndPromise.set(this, () => { });
        _EventStream_listeners.set(this, {});
        _EventStream_ended.set(this, false);
        _EventStream_errored.set(this, false);
        _EventStream_aborted.set(this, false);
        _EventStream_catchingPromiseCreated.set(this, false);
        __classPrivateFieldSet$2(this, _EventStream_connectedPromise, new Promise((resolve, reject) => {
            __classPrivateFieldSet$2(this, _EventStream_resolveConnectedPromise, resolve, "f");
            __classPrivateFieldSet$2(this, _EventStream_rejectConnectedPromise, reject, "f");
        }), "f");
        __classPrivateFieldSet$2(this, _EventStream_endPromise, new Promise((resolve, reject) => {
            __classPrivateFieldSet$2(this, _EventStream_resolveEndPromise, resolve, "f");
            __classPrivateFieldSet$2(this, _EventStream_rejectEndPromise, reject, "f");
        }), "f");
        // Don't let these promises cause unhandled rejection errors.
        // we will manually cause an unhandled rejection error later
        // if the user hasn't registered any error listener or called
        // any promise-returning method.
        __classPrivateFieldGet$3(this, _EventStream_connectedPromise, "f").catch(() => { });
        __classPrivateFieldGet$3(this, _EventStream_endPromise, "f").catch(() => { });
    }
    _run(executor) {
        // Unfortunately if we call `executor()` immediately we get runtime errors about
        // references to `this` before the `super()` constructor call returns.
        setTimeout(() => {
            executor().then(() => {
                this._emitFinal();
                this._emit('end');
            }, __classPrivateFieldGet$3(this, _EventStream_instances, "m", _EventStream_handleError).bind(this));
        }, 0);
    }
    _connected() {
        if (this.ended)
            return;
        __classPrivateFieldGet$3(this, _EventStream_resolveConnectedPromise, "f").call(this);
        this._emit('connect');
    }
    get ended() {
        return __classPrivateFieldGet$3(this, _EventStream_ended, "f");
    }
    get errored() {
        return __classPrivateFieldGet$3(this, _EventStream_errored, "f");
    }
    get aborted() {
        return __classPrivateFieldGet$3(this, _EventStream_aborted, "f");
    }
    abort() {
        this.controller.abort();
    }
    /**
     * Adds the listener function to the end of the listeners array for the event.
     * No checks are made to see if the listener has already been added. Multiple calls passing
     * the same combination of event and listener will result in the listener being added, and
     * called, multiple times.
     * @returns this ChatCompletionStream, so that calls can be chained
     */
    on(event, listener) {
        const listeners = __classPrivateFieldGet$3(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet$3(this, _EventStream_listeners, "f")[event] = []);
        listeners.push({ listener });
        return this;
    }
    /**
     * Removes the specified listener from the listener array for the event.
     * off() will remove, at most, one instance of a listener from the listener array. If any single
     * listener has been added multiple times to the listener array for the specified event, then
     * off() must be called multiple times to remove each instance.
     * @returns this ChatCompletionStream, so that calls can be chained
     */
    off(event, listener) {
        const listeners = __classPrivateFieldGet$3(this, _EventStream_listeners, "f")[event];
        if (!listeners)
            return this;
        const index = listeners.findIndex((l) => l.listener === listener);
        if (index >= 0)
            listeners.splice(index, 1);
        return this;
    }
    /**
     * Adds a one-time listener function for the event. The next time the event is triggered,
     * this listener is removed and then invoked.
     * @returns this ChatCompletionStream, so that calls can be chained
     */
    once(event, listener) {
        const listeners = __classPrivateFieldGet$3(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet$3(this, _EventStream_listeners, "f")[event] = []);
        listeners.push({ listener, once: true });
        return this;
    }
    /**
     * This is similar to `.once()`, but returns a Promise that resolves the next time
     * the event is triggered, instead of calling a listener callback.
     * @returns a Promise that resolves the next time given event is triggered,
     * or rejects if an error is emitted.  (If you request the 'error' event,
     * returns a promise that resolves with the error).
     *
     * Example:
     *
     *   const message = await stream.emitted('message') // rejects if the stream errors
     */
    emitted(event) {
        return new Promise((resolve, reject) => {
            __classPrivateFieldSet$2(this, _EventStream_catchingPromiseCreated, true, "f");
            if (event !== 'error')
                this.once('error', reject);
            this.once(event, resolve);
        });
    }
    async done() {
        __classPrivateFieldSet$2(this, _EventStream_catchingPromiseCreated, true, "f");
        await __classPrivateFieldGet$3(this, _EventStream_endPromise, "f");
    }
    _emit(event, ...args) {
        // make sure we don't emit any events after end
        if (__classPrivateFieldGet$3(this, _EventStream_ended, "f")) {
            return;
        }
        if (event === 'end') {
            __classPrivateFieldSet$2(this, _EventStream_ended, true, "f");
            __classPrivateFieldGet$3(this, _EventStream_resolveEndPromise, "f").call(this);
        }
        const listeners = __classPrivateFieldGet$3(this, _EventStream_listeners, "f")[event];
        if (listeners) {
            __classPrivateFieldGet$3(this, _EventStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
            listeners.forEach(({ listener }) => listener(...args));
        }
        if (event === 'abort') {
            const error = args[0];
            if (!__classPrivateFieldGet$3(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
                Promise.reject(error);
            }
            __classPrivateFieldGet$3(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
            __classPrivateFieldGet$3(this, _EventStream_rejectEndPromise, "f").call(this, error);
            this._emit('end');
            return;
        }
        if (event === 'error') {
            // NOTE: _emit('error', error) should only be called from #handleError().
            const error = args[0];
            if (!__classPrivateFieldGet$3(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
                // Trigger an unhandled rejection if the user hasn't registered any error handlers.
                // If you are seeing stack traces here, make sure to handle errors via either:
                // - runner.on('error', () => ...)
                // - await runner.done()
                // - await runner.finalChatCompletion()
                // - etc.
                Promise.reject(error);
            }
            __classPrivateFieldGet$3(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
            __classPrivateFieldGet$3(this, _EventStream_rejectEndPromise, "f").call(this, error);
            this._emit('end');
        }
    }
    _emitFinal() { }
}
_EventStream_connectedPromise = new WeakMap(), _EventStream_resolveConnectedPromise = new WeakMap(), _EventStream_rejectConnectedPromise = new WeakMap(), _EventStream_endPromise = new WeakMap(), _EventStream_resolveEndPromise = new WeakMap(), _EventStream_rejectEndPromise = new WeakMap(), _EventStream_listeners = new WeakMap(), _EventStream_ended = new WeakMap(), _EventStream_errored = new WeakMap(), _EventStream_aborted = new WeakMap(), _EventStream_catchingPromiseCreated = new WeakMap(), _EventStream_instances = new WeakSet(), _EventStream_handleError = function _EventStream_handleError(error) {
    __classPrivateFieldSet$2(this, _EventStream_errored, true, "f");
    if (error instanceof Error && error.name === 'AbortError') {
        error = new APIUserAbortError();
    }
    if (error instanceof APIUserAbortError) {
        __classPrivateFieldSet$2(this, _EventStream_aborted, true, "f");
        return this._emit('abort', error);
    }
    if (error instanceof OpenAIError) {
        return this._emit('error', error);
    }
    if (error instanceof Error) {
        const openAIError = new OpenAIError(error.message);
        // @ts-ignore
        openAIError.cause = error;
        return this._emit('error', openAIError);
    }
    return this._emit('error', new OpenAIError(String(error)));
};

function isAutoParsableResponseFormat(response_format) {
    return response_format?.['$brand'] === 'auto-parseable-response-format';
}
function isAutoParsableTool(tool) {
    return tool?.['$brand'] === 'auto-parseable-tool';
}
function maybeParseChatCompletion(completion, params) {
    if (!params || !hasAutoParseableInput(params)) {
        return {
            ...completion,
            choices: completion.choices.map((choice) => ({
                ...choice,
                message: {
                    ...choice.message,
                    parsed: null,
                    ...(choice.message.tool_calls ?
                        {
                            tool_calls: choice.message.tool_calls,
                        }
                        : undefined),
                },
            })),
        };
    }
    return parseChatCompletion(completion, params);
}
function parseChatCompletion(completion, params) {
    const choices = completion.choices.map((choice) => {
        if (choice.finish_reason === 'length') {
            throw new LengthFinishReasonError();
        }
        if (choice.finish_reason === 'content_filter') {
            throw new ContentFilterFinishReasonError();
        }
        return {
            ...choice,
            message: {
                ...choice.message,
                ...(choice.message.tool_calls ?
                    {
                        tool_calls: choice.message.tool_calls?.map((toolCall) => parseToolCall(params, toolCall)) ?? undefined,
                    }
                    : undefined),
                parsed: choice.message.content && !choice.message.refusal ?
                    parseResponseFormat(params, choice.message.content)
                    : null,
            },
        };
    });
    return { ...completion, choices };
}
function parseResponseFormat(params, content) {
    if (params.response_format?.type !== 'json_schema') {
        return null;
    }
    if (params.response_format?.type === 'json_schema') {
        if ('$parseRaw' in params.response_format) {
            const response_format = params.response_format;
            return response_format.$parseRaw(content);
        }
        return JSON.parse(content);
    }
    return null;
}
function parseToolCall(params, toolCall) {
    const inputTool = params.tools?.find((inputTool) => inputTool.function?.name === toolCall.function.name);
    return {
        ...toolCall,
        function: {
            ...toolCall.function,
            parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCall.function.arguments)
                : inputTool?.function.strict ? JSON.parse(toolCall.function.arguments)
                    : null,
        },
    };
}
function shouldParseToolCall(params, toolCall) {
    if (!params) {
        return false;
    }
    const inputTool = params.tools?.find((inputTool) => inputTool.function?.name === toolCall.function.name);
    return isAutoParsableTool(inputTool) || inputTool?.function.strict || false;
}
function hasAutoParseableInput(params) {
    if (isAutoParsableResponseFormat(params.response_format)) {
        return true;
    }
    return (params.tools?.some((t) => isAutoParsableTool(t) || (t.type === 'function' && t.function.strict === true)) ?? false);
}
function validateInputTools(tools) {
    for (const tool of tools ?? []) {
        if (tool.type !== 'function') {
            throw new OpenAIError(`Currently only \`function\` tool types support auto-parsing; Received \`${tool.type}\``);
        }
        if (tool.function.strict !== true) {
            throw new OpenAIError(`The \`${tool.function.name}\` tool is not marked with \`strict: true\`. Only strict function tools can be auto-parsed`);
        }
    }
}

var __classPrivateFieldGet$2 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _AbstractChatCompletionRunner_instances, _AbstractChatCompletionRunner_getFinalContent, _AbstractChatCompletionRunner_getFinalMessage, _AbstractChatCompletionRunner_getFinalFunctionCall, _AbstractChatCompletionRunner_getFinalFunctionCallResult, _AbstractChatCompletionRunner_calculateTotalUsage, _AbstractChatCompletionRunner_validateParams, _AbstractChatCompletionRunner_stringifyFunctionCallResult;
const DEFAULT_MAX_CHAT_COMPLETIONS = 10;
class AbstractChatCompletionRunner extends EventStream {
    constructor() {
        super(...arguments);
        _AbstractChatCompletionRunner_instances.add(this);
        this._chatCompletions = [];
        this.messages = [];
    }
    _addChatCompletion(chatCompletion) {
        this._chatCompletions.push(chatCompletion);
        this._emit('chatCompletion', chatCompletion);
        const message = chatCompletion.choices[0]?.message;
        if (message)
            this._addMessage(message);
        return chatCompletion;
    }
    _addMessage(message, emit = true) {
        if (!('content' in message))
            message.content = null;
        this.messages.push(message);
        if (emit) {
            this._emit('message', message);
            if ((isFunctionMessage(message) || isToolMessage(message)) && message.content) {
                // Note, this assumes that {role: 'tool', content: …} is always the result of a call of tool of type=function.
                this._emit('functionCallResult', message.content);
            }
            else if (isAssistantMessage(message) && message.function_call) {
                this._emit('functionCall', message.function_call);
            }
            else if (isAssistantMessage(message) && message.tool_calls) {
                for (const tool_call of message.tool_calls) {
                    if (tool_call.type === 'function') {
                        this._emit('functionCall', tool_call.function);
                    }
                }
            }
        }
    }
    /**
     * @returns a promise that resolves with the final ChatCompletion, or rejects
     * if an error occurred or the stream ended prematurely without producing a ChatCompletion.
     */
    async finalChatCompletion() {
        await this.done();
        const completion = this._chatCompletions[this._chatCompletions.length - 1];
        if (!completion)
            throw new OpenAIError('stream ended without producing a ChatCompletion');
        return completion;
    }
    /**
     * @returns a promise that resolves with the content of the final ChatCompletionMessage, or rejects
     * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
     */
    async finalContent() {
        await this.done();
        return __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
    }
    /**
     * @returns a promise that resolves with the the final assistant ChatCompletionMessage response,
     * or rejects if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
     */
    async finalMessage() {
        await this.done();
        return __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
    }
    /**
     * @returns a promise that resolves with the content of the final FunctionCall, or rejects
     * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
     */
    async finalFunctionCall() {
        await this.done();
        return __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionCall).call(this);
    }
    async finalFunctionCallResult() {
        await this.done();
        return __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionCallResult).call(this);
    }
    async totalUsage() {
        await this.done();
        return __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this);
    }
    allChatCompletions() {
        return [...this._chatCompletions];
    }
    _emitFinal() {
        const completion = this._chatCompletions[this._chatCompletions.length - 1];
        if (completion)
            this._emit('finalChatCompletion', completion);
        const finalMessage = __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
        if (finalMessage)
            this._emit('finalMessage', finalMessage);
        const finalContent = __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
        if (finalContent)
            this._emit('finalContent', finalContent);
        const finalFunctionCall = __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionCall).call(this);
        if (finalFunctionCall)
            this._emit('finalFunctionCall', finalFunctionCall);
        const finalFunctionCallResult = __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionCallResult).call(this);
        if (finalFunctionCallResult != null)
            this._emit('finalFunctionCallResult', finalFunctionCallResult);
        if (this._chatCompletions.some((c) => c.usage)) {
            this._emit('totalUsage', __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this));
        }
    }
    async _createChatCompletion(client, params, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_validateParams).call(this, params);
        const chatCompletion = await client.chat.completions.create({ ...params, stream: false }, { ...options, signal: this.controller.signal });
        this._connected();
        return this._addChatCompletion(parseChatCompletion(chatCompletion, params));
    }
    async _runChatCompletion(client, params, options) {
        for (const message of params.messages) {
            this._addMessage(message, false);
        }
        return await this._createChatCompletion(client, params, options);
    }
    async _runFunctions(client, params, options) {
        const role = 'function';
        const { function_call = 'auto', stream, ...restParams } = params;
        const singleFunctionToCall = typeof function_call !== 'string' && function_call?.name;
        const { maxChatCompletions = DEFAULT_MAX_CHAT_COMPLETIONS } = options || {};
        const functionsByName = {};
        for (const f of params.functions) {
            functionsByName[f.name || f.function.name] = f;
        }
        const functions = params.functions.map((f) => ({
            name: f.name || f.function.name,
            parameters: f.parameters,
            description: f.description,
        }));
        for (const message of params.messages) {
            this._addMessage(message, false);
        }
        for (let i = 0; i < maxChatCompletions; ++i) {
            const chatCompletion = await this._createChatCompletion(client, {
                ...restParams,
                function_call,
                functions,
                messages: [...this.messages],
            }, options);
            const message = chatCompletion.choices[0]?.message;
            if (!message) {
                throw new OpenAIError(`missing message in ChatCompletion response`);
            }
            if (!message.function_call)
                return;
            const { name, arguments: args } = message.function_call;
            const fn = functionsByName[name];
            if (!fn) {
                const content = `Invalid function_call: ${JSON.stringify(name)}. Available options are: ${functions
                    .map((f) => JSON.stringify(f.name))
                    .join(', ')}. Please try again`;
                this._addMessage({ role, name, content });
                continue;
            }
            else if (singleFunctionToCall && singleFunctionToCall !== name) {
                const content = `Invalid function_call: ${JSON.stringify(name)}. ${JSON.stringify(singleFunctionToCall)} requested. Please try again`;
                this._addMessage({ role, name, content });
                continue;
            }
            let parsed;
            try {
                parsed = isRunnableFunctionWithParse(fn) ? await fn.parse(args) : args;
            }
            catch (error) {
                this._addMessage({
                    role,
                    name,
                    content: error instanceof Error ? error.message : String(error),
                });
                continue;
            }
            // @ts-expect-error it can't rule out `never` type.
            const rawContent = await fn.function(parsed, this);
            const content = __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_stringifyFunctionCallResult).call(this, rawContent);
            this._addMessage({ role, name, content });
            if (singleFunctionToCall)
                return;
        }
    }
    async _runTools(client, params, options) {
        const role = 'tool';
        const { tool_choice = 'auto', stream, ...restParams } = params;
        const singleFunctionToCall = typeof tool_choice !== 'string' && tool_choice?.function?.name;
        const { maxChatCompletions = DEFAULT_MAX_CHAT_COMPLETIONS } = options || {};
        // TODO(someday): clean this logic up
        const inputTools = params.tools.map((tool) => {
            if (isAutoParsableTool(tool)) {
                if (!tool.$callback) {
                    throw new OpenAIError('Tool given to `.runTools()` that does not have an associated function');
                }
                return {
                    type: 'function',
                    function: {
                        function: tool.$callback,
                        name: tool.function.name,
                        description: tool.function.description || '',
                        parameters: tool.function.parameters,
                        parse: tool.$parseRaw,
                        strict: true,
                    },
                };
            }
            return tool;
        });
        const functionsByName = {};
        for (const f of inputTools) {
            if (f.type === 'function') {
                functionsByName[f.function.name || f.function.function.name] = f.function;
            }
        }
        const tools = 'tools' in params ?
            inputTools.map((t) => t.type === 'function' ?
                {
                    type: 'function',
                    function: {
                        name: t.function.name || t.function.function.name,
                        parameters: t.function.parameters,
                        description: t.function.description,
                        strict: t.function.strict,
                    },
                }
                : t)
            : undefined;
        for (const message of params.messages) {
            this._addMessage(message, false);
        }
        for (let i = 0; i < maxChatCompletions; ++i) {
            const chatCompletion = await this._createChatCompletion(client, {
                ...restParams,
                tool_choice,
                tools,
                messages: [...this.messages],
            }, options);
            const message = chatCompletion.choices[0]?.message;
            if (!message) {
                throw new OpenAIError(`missing message in ChatCompletion response`);
            }
            if (!message.tool_calls?.length) {
                return;
            }
            for (const tool_call of message.tool_calls) {
                if (tool_call.type !== 'function')
                    continue;
                const tool_call_id = tool_call.id;
                const { name, arguments: args } = tool_call.function;
                const fn = functionsByName[name];
                if (!fn) {
                    const content = `Invalid tool_call: ${JSON.stringify(name)}. Available options are: ${Object.keys(functionsByName)
                        .map((name) => JSON.stringify(name))
                        .join(', ')}. Please try again`;
                    this._addMessage({ role, tool_call_id, content });
                    continue;
                }
                else if (singleFunctionToCall && singleFunctionToCall !== name) {
                    const content = `Invalid tool_call: ${JSON.stringify(name)}. ${JSON.stringify(singleFunctionToCall)} requested. Please try again`;
                    this._addMessage({ role, tool_call_id, content });
                    continue;
                }
                let parsed;
                try {
                    parsed = isRunnableFunctionWithParse(fn) ? await fn.parse(args) : args;
                }
                catch (error) {
                    const content = error instanceof Error ? error.message : String(error);
                    this._addMessage({ role, tool_call_id, content });
                    continue;
                }
                // @ts-expect-error it can't rule out `never` type.
                const rawContent = await fn.function(parsed, this);
                const content = __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_stringifyFunctionCallResult).call(this, rawContent);
                this._addMessage({ role, tool_call_id, content });
                if (singleFunctionToCall) {
                    return;
                }
            }
        }
        return;
    }
}
_AbstractChatCompletionRunner_instances = new WeakSet(), _AbstractChatCompletionRunner_getFinalContent = function _AbstractChatCompletionRunner_getFinalContent() {
    return __classPrivateFieldGet$2(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this).content ?? null;
}, _AbstractChatCompletionRunner_getFinalMessage = function _AbstractChatCompletionRunner_getFinalMessage() {
    let i = this.messages.length;
    while (i-- > 0) {
        const message = this.messages[i];
        if (isAssistantMessage(message)) {
            const { function_call, ...rest } = message;
            // TODO: support audio here
            const ret = {
                ...rest,
                content: message.content ?? null,
                refusal: message.refusal ?? null,
            };
            if (function_call) {
                ret.function_call = function_call;
            }
            return ret;
        }
    }
    throw new OpenAIError('stream ended without producing a ChatCompletionMessage with role=assistant');
}, _AbstractChatCompletionRunner_getFinalFunctionCall = function _AbstractChatCompletionRunner_getFinalFunctionCall() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
        const message = this.messages[i];
        if (isAssistantMessage(message) && message?.function_call) {
            return message.function_call;
        }
        if (isAssistantMessage(message) && message?.tool_calls?.length) {
            return message.tool_calls.at(-1)?.function;
        }
    }
    return;
}, _AbstractChatCompletionRunner_getFinalFunctionCallResult = function _AbstractChatCompletionRunner_getFinalFunctionCallResult() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
        const message = this.messages[i];
        if (isFunctionMessage(message) && message.content != null) {
            return message.content;
        }
        if (isToolMessage(message) &&
            message.content != null &&
            typeof message.content === 'string' &&
            this.messages.some((x) => x.role === 'assistant' &&
                x.tool_calls?.some((y) => y.type === 'function' && y.id === message.tool_call_id))) {
            return message.content;
        }
    }
    return;
}, _AbstractChatCompletionRunner_calculateTotalUsage = function _AbstractChatCompletionRunner_calculateTotalUsage() {
    const total = {
        completion_tokens: 0,
        prompt_tokens: 0,
        total_tokens: 0,
    };
    for (const { usage } of this._chatCompletions) {
        if (usage) {
            total.completion_tokens += usage.completion_tokens;
            total.prompt_tokens += usage.prompt_tokens;
            total.total_tokens += usage.total_tokens;
        }
    }
    return total;
}, _AbstractChatCompletionRunner_validateParams = function _AbstractChatCompletionRunner_validateParams(params) {
    if (params.n != null && params.n > 1) {
        throw new OpenAIError('ChatCompletion convenience helpers only support n=1 at this time. To use n>1, please use chat.completions.create() directly.');
    }
}, _AbstractChatCompletionRunner_stringifyFunctionCallResult = function _AbstractChatCompletionRunner_stringifyFunctionCallResult(rawContent) {
    return (typeof rawContent === 'string' ? rawContent
        : rawContent === undefined ? 'undefined'
            : JSON.stringify(rawContent));
};

class ChatCompletionRunner extends AbstractChatCompletionRunner {
    /** @deprecated - please use `runTools` instead. */
    static runFunctions(client, params, options) {
        const runner = new ChatCompletionRunner();
        const opts = {
            ...options,
            headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'runFunctions' },
        };
        runner._run(() => runner._runFunctions(client, params, opts));
        return runner;
    }
    static runTools(client, params, options) {
        const runner = new ChatCompletionRunner();
        const opts = {
            ...options,
            headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'runTools' },
        };
        runner._run(() => runner._runTools(client, params, opts));
        return runner;
    }
    _addMessage(message, emit = true) {
        super._addMessage(message, emit);
        if (isAssistantMessage(message) && message.content) {
            this._emit('content', message.content);
        }
    }
}

const STR = 0b000000001;
const NUM = 0b000000010;
const ARR = 0b000000100;
const OBJ = 0b000001000;
const NULL = 0b000010000;
const BOOL = 0b000100000;
const NAN = 0b001000000;
const INFINITY = 0b010000000;
const MINUS_INFINITY = 0b100000000;
const INF = INFINITY | MINUS_INFINITY;
const SPECIAL = NULL | BOOL | INF | NAN;
const ATOM = STR | NUM | SPECIAL;
const COLLECTION = ARR | OBJ;
const ALL = ATOM | COLLECTION;
const Allow = {
    STR,
    NUM,
    ARR,
    OBJ,
    NULL,
    BOOL,
    NAN,
    INFINITY,
    MINUS_INFINITY,
    INF,
    SPECIAL,
    ATOM,
    COLLECTION,
    ALL,
};
// The JSON string segment was unable to be parsed completely
class PartialJSON extends Error {
}
class MalformedJSON extends Error {
}
/**
 * Parse incomplete JSON
 * @param {string} jsonString Partial JSON to be parsed
 * @param {number} allowPartial Specify what types are allowed to be partial, see {@link Allow} for details
 * @returns The parsed JSON
 * @throws {PartialJSON} If the JSON is incomplete (related to the `allow` parameter)
 * @throws {MalformedJSON} If the JSON is malformed
 */
function parseJSON(jsonString, allowPartial = Allow.ALL) {
    if (typeof jsonString !== 'string') {
        throw new TypeError(`expecting str, got ${typeof jsonString}`);
    }
    if (!jsonString.trim()) {
        throw new Error(`${jsonString} is empty`);
    }
    return _parseJSON(jsonString.trim(), allowPartial);
}
const _parseJSON = (jsonString, allow) => {
    const length = jsonString.length;
    let index = 0;
    const markPartialJSON = (msg) => {
        throw new PartialJSON(`${msg} at position ${index}`);
    };
    const throwMalformedError = (msg) => {
        throw new MalformedJSON(`${msg} at position ${index}`);
    };
    const parseAny = () => {
        skipBlank();
        if (index >= length)
            markPartialJSON('Unexpected end of input');
        if (jsonString[index] === '"')
            return parseStr();
        if (jsonString[index] === '{')
            return parseObj();
        if (jsonString[index] === '[')
            return parseArr();
        if (jsonString.substring(index, index + 4) === 'null' ||
            (Allow.NULL & allow && length - index < 4 && 'null'.startsWith(jsonString.substring(index)))) {
            index += 4;
            return null;
        }
        if (jsonString.substring(index, index + 4) === 'true' ||
            (Allow.BOOL & allow && length - index < 4 && 'true'.startsWith(jsonString.substring(index)))) {
            index += 4;
            return true;
        }
        if (jsonString.substring(index, index + 5) === 'false' ||
            (Allow.BOOL & allow && length - index < 5 && 'false'.startsWith(jsonString.substring(index)))) {
            index += 5;
            return false;
        }
        if (jsonString.substring(index, index + 8) === 'Infinity' ||
            (Allow.INFINITY & allow && length - index < 8 && 'Infinity'.startsWith(jsonString.substring(index)))) {
            index += 8;
            return Infinity;
        }
        if (jsonString.substring(index, index + 9) === '-Infinity' ||
            (Allow.MINUS_INFINITY & allow &&
                1 < length - index &&
                length - index < 9 &&
                '-Infinity'.startsWith(jsonString.substring(index)))) {
            index += 9;
            return -Infinity;
        }
        if (jsonString.substring(index, index + 3) === 'NaN' ||
            (Allow.NAN & allow && length - index < 3 && 'NaN'.startsWith(jsonString.substring(index)))) {
            index += 3;
            return NaN;
        }
        return parseNum();
    };
    const parseStr = () => {
        const start = index;
        let escape = false;
        index++; // skip initial quote
        while (index < length && (jsonString[index] !== '"' || (escape && jsonString[index - 1] === '\\'))) {
            escape = jsonString[index] === '\\' ? !escape : false;
            index++;
        }
        if (jsonString.charAt(index) == '"') {
            try {
                return JSON.parse(jsonString.substring(start, ++index - Number(escape)));
            }
            catch (e) {
                throwMalformedError(String(e));
            }
        }
        else if (Allow.STR & allow) {
            try {
                return JSON.parse(jsonString.substring(start, index - Number(escape)) + '"');
            }
            catch (e) {
                // SyntaxError: Invalid escape sequence
                return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf('\\')) + '"');
            }
        }
        markPartialJSON('Unterminated string literal');
    };
    const parseObj = () => {
        index++; // skip initial brace
        skipBlank();
        const obj = {};
        try {
            while (jsonString[index] !== '}') {
                skipBlank();
                if (index >= length && Allow.OBJ & allow)
                    return obj;
                const key = parseStr();
                skipBlank();
                index++; // skip colon
                try {
                    const value = parseAny();
                    Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
                }
                catch (e) {
                    if (Allow.OBJ & allow)
                        return obj;
                    else
                        throw e;
                }
                skipBlank();
                if (jsonString[index] === ',')
                    index++; // skip comma
            }
        }
        catch (e) {
            if (Allow.OBJ & allow)
                return obj;
            else
                markPartialJSON("Expected '}' at end of object");
        }
        index++; // skip final brace
        return obj;
    };
    const parseArr = () => {
        index++; // skip initial bracket
        const arr = [];
        try {
            while (jsonString[index] !== ']') {
                arr.push(parseAny());
                skipBlank();
                if (jsonString[index] === ',') {
                    index++; // skip comma
                }
            }
        }
        catch (e) {
            if (Allow.ARR & allow) {
                return arr;
            }
            markPartialJSON("Expected ']' at end of array");
        }
        index++; // skip final bracket
        return arr;
    };
    const parseNum = () => {
        if (index === 0) {
            if (jsonString === '-' && Allow.NUM & allow)
                markPartialJSON("Not sure what '-' is");
            try {
                return JSON.parse(jsonString);
            }
            catch (e) {
                if (Allow.NUM & allow) {
                    try {
                        if ('.' === jsonString[jsonString.length - 1])
                            return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf('.')));
                        return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf('e')));
                    }
                    catch (e) { }
                }
                throwMalformedError(String(e));
            }
        }
        const start = index;
        if (jsonString[index] === '-')
            index++;
        while (jsonString[index] && !',]}'.includes(jsonString[index]))
            index++;
        if (index == length && !(Allow.NUM & allow))
            markPartialJSON('Unterminated number literal');
        try {
            return JSON.parse(jsonString.substring(start, index));
        }
        catch (e) {
            if (jsonString.substring(start, index) === '-' && Allow.NUM & allow)
                markPartialJSON("Not sure what '-' is");
            try {
                return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf('e')));
            }
            catch (e) {
                throwMalformedError(String(e));
            }
        }
    };
    const skipBlank = () => {
        while (index < length && ' \n\r\t'.includes(jsonString[index])) {
            index++;
        }
    };
    return parseAny();
};
// using this function with malformed JSON is undefined behavior
const partialParse = (input) => parseJSON(input, Allow.ALL ^ Allow.NUM);

var __classPrivateFieldSet$1 = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet$1 = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _ChatCompletionStream_instances, _ChatCompletionStream_params, _ChatCompletionStream_choiceEventStates, _ChatCompletionStream_currentChatCompletionSnapshot, _ChatCompletionStream_beginRequest, _ChatCompletionStream_getChoiceEventState, _ChatCompletionStream_addChunk, _ChatCompletionStream_emitToolCallDoneEvent, _ChatCompletionStream_emitContentDoneEvents, _ChatCompletionStream_endRequest, _ChatCompletionStream_getAutoParseableResponseFormat, _ChatCompletionStream_accumulateChatCompletion;
class ChatCompletionStream extends AbstractChatCompletionRunner {
    constructor(params) {
        super();
        _ChatCompletionStream_instances.add(this);
        _ChatCompletionStream_params.set(this, void 0);
        _ChatCompletionStream_choiceEventStates.set(this, void 0);
        _ChatCompletionStream_currentChatCompletionSnapshot.set(this, void 0);
        __classPrivateFieldSet$1(this, _ChatCompletionStream_params, params, "f");
        __classPrivateFieldSet$1(this, _ChatCompletionStream_choiceEventStates, [], "f");
    }
    get currentChatCompletionSnapshot() {
        return __classPrivateFieldGet$1(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    }
    /**
     * Intended for use on the frontend, consuming a stream produced with
     * `.toReadableStream()` on the backend.
     *
     * Note that messages sent to the model do not appear in `.on('message')`
     * in this context.
     */
    static fromReadableStream(stream) {
        const runner = new ChatCompletionStream(null);
        runner._run(() => runner._fromReadableStream(stream));
        return runner;
    }
    static createChatCompletion(client, params, options) {
        const runner = new ChatCompletionStream(params);
        runner._run(() => runner._runChatCompletion(client, { ...params, stream: true }, { ...options, headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'stream' } }));
        return runner;
    }
    async _createChatCompletion(client, params, options) {
        super._createChatCompletion;
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
        const stream = await client.chat.completions.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
        this._connected();
        for await (const chunk of stream) {
            __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError();
        }
        return this._addChatCompletion(__classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
    }
    async _fromReadableStream(readableStream, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
        this._connected();
        const stream = Stream.fromReadableStream(readableStream, this.controller);
        let chatId;
        for await (const chunk of stream) {
            if (chatId && chatId !== chunk.id) {
                // A new request has been made.
                this._addChatCompletion(__classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
            }
            __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
            chatId = chunk.id;
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError();
        }
        return this._addChatCompletion(__classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
    }
    [(_ChatCompletionStream_params = new WeakMap(), _ChatCompletionStream_choiceEventStates = new WeakMap(), _ChatCompletionStream_currentChatCompletionSnapshot = new WeakMap(), _ChatCompletionStream_instances = new WeakSet(), _ChatCompletionStream_beginRequest = function _ChatCompletionStream_beginRequest() {
        if (this.ended)
            return;
        __classPrivateFieldSet$1(this, _ChatCompletionStream_currentChatCompletionSnapshot, undefined, "f");
    }, _ChatCompletionStream_getChoiceEventState = function _ChatCompletionStream_getChoiceEventState(choice) {
        let state = __classPrivateFieldGet$1(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index];
        if (state) {
            return state;
        }
        state = {
            content_done: false,
            refusal_done: false,
            logprobs_content_done: false,
            logprobs_refusal_done: false,
            done_tool_calls: new Set(),
            current_tool_call_index: null,
        };
        __classPrivateFieldGet$1(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index] = state;
        return state;
    }, _ChatCompletionStream_addChunk = function _ChatCompletionStream_addChunk(chunk) {
        if (this.ended)
            return;
        const completion = __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_accumulateChatCompletion).call(this, chunk);
        this._emit('chunk', chunk, completion);
        for (const choice of chunk.choices) {
            const choiceSnapshot = completion.choices[choice.index];
            if (choice.delta.content != null &&
                choiceSnapshot.message?.role === 'assistant' &&
                choiceSnapshot.message?.content) {
                this._emit('content', choice.delta.content, choiceSnapshot.message.content);
                this._emit('content.delta', {
                    delta: choice.delta.content,
                    snapshot: choiceSnapshot.message.content,
                    parsed: choiceSnapshot.message.parsed,
                });
            }
            if (choice.delta.refusal != null &&
                choiceSnapshot.message?.role === 'assistant' &&
                choiceSnapshot.message?.refusal) {
                this._emit('refusal.delta', {
                    delta: choice.delta.refusal,
                    snapshot: choiceSnapshot.message.refusal,
                });
            }
            if (choice.logprobs?.content != null && choiceSnapshot.message?.role === 'assistant') {
                this._emit('logprobs.content.delta', {
                    content: choice.logprobs?.content,
                    snapshot: choiceSnapshot.logprobs?.content ?? [],
                });
            }
            if (choice.logprobs?.refusal != null && choiceSnapshot.message?.role === 'assistant') {
                this._emit('logprobs.refusal.delta', {
                    refusal: choice.logprobs?.refusal,
                    snapshot: choiceSnapshot.logprobs?.refusal ?? [],
                });
            }
            const state = __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
            if (choiceSnapshot.finish_reason) {
                __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
                if (state.current_tool_call_index != null) {
                    __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
                }
            }
            for (const toolCall of choice.delta.tool_calls ?? []) {
                if (state.current_tool_call_index !== toolCall.index) {
                    __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
                    // new tool call started, the previous one is done
                    if (state.current_tool_call_index != null) {
                        __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
                    }
                }
                state.current_tool_call_index = toolCall.index;
            }
            for (const toolCallDelta of choice.delta.tool_calls ?? []) {
                const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallDelta.index];
                if (!toolCallSnapshot?.type) {
                    continue;
                }
                if (toolCallSnapshot?.type === 'function') {
                    this._emit('tool_calls.function.arguments.delta', {
                        name: toolCallSnapshot.function?.name,
                        index: toolCallDelta.index,
                        arguments: toolCallSnapshot.function.arguments,
                        parsed_arguments: toolCallSnapshot.function.parsed_arguments,
                        arguments_delta: toolCallDelta.function?.arguments ?? '',
                    });
                }
                else {
                    assertNever(toolCallSnapshot?.type);
                }
            }
        }
    }, _ChatCompletionStream_emitToolCallDoneEvent = function _ChatCompletionStream_emitToolCallDoneEvent(choiceSnapshot, toolCallIndex) {
        const state = __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
        if (state.done_tool_calls.has(toolCallIndex)) {
            // we've already fired the done event
            return;
        }
        const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallIndex];
        if (!toolCallSnapshot) {
            throw new Error('no tool call snapshot');
        }
        if (!toolCallSnapshot.type) {
            throw new Error('tool call snapshot missing `type`');
        }
        if (toolCallSnapshot.type === 'function') {
            const inputTool = __classPrivateFieldGet$1(this, _ChatCompletionStream_params, "f")?.tools?.find((tool) => tool.type === 'function' && tool.function.name === toolCallSnapshot.function.name);
            this._emit('tool_calls.function.arguments.done', {
                name: toolCallSnapshot.function.name,
                index: toolCallIndex,
                arguments: toolCallSnapshot.function.arguments,
                parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCallSnapshot.function.arguments)
                    : inputTool?.function.strict ? JSON.parse(toolCallSnapshot.function.arguments)
                        : null,
            });
        }
        else {
            assertNever(toolCallSnapshot.type);
        }
    }, _ChatCompletionStream_emitContentDoneEvents = function _ChatCompletionStream_emitContentDoneEvents(choiceSnapshot) {
        const state = __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
        if (choiceSnapshot.message.content && !state.content_done) {
            state.content_done = true;
            const responseFormat = __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this);
            this._emit('content.done', {
                content: choiceSnapshot.message.content,
                parsed: responseFormat ? responseFormat.$parseRaw(choiceSnapshot.message.content) : null,
            });
        }
        if (choiceSnapshot.message.refusal && !state.refusal_done) {
            state.refusal_done = true;
            this._emit('refusal.done', { refusal: choiceSnapshot.message.refusal });
        }
        if (choiceSnapshot.logprobs?.content && !state.logprobs_content_done) {
            state.logprobs_content_done = true;
            this._emit('logprobs.content.done', { content: choiceSnapshot.logprobs.content });
        }
        if (choiceSnapshot.logprobs?.refusal && !state.logprobs_refusal_done) {
            state.logprobs_refusal_done = true;
            this._emit('logprobs.refusal.done', { refusal: choiceSnapshot.logprobs.refusal });
        }
    }, _ChatCompletionStream_endRequest = function _ChatCompletionStream_endRequest() {
        if (this.ended) {
            throw new OpenAIError(`stream has ended, this shouldn't happen`);
        }
        const snapshot = __classPrivateFieldGet$1(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
        if (!snapshot) {
            throw new OpenAIError(`request ended without sending any chunks`);
        }
        __classPrivateFieldSet$1(this, _ChatCompletionStream_currentChatCompletionSnapshot, undefined, "f");
        __classPrivateFieldSet$1(this, _ChatCompletionStream_choiceEventStates, [], "f");
        return finalizeChatCompletion(snapshot, __classPrivateFieldGet$1(this, _ChatCompletionStream_params, "f"));
    }, _ChatCompletionStream_getAutoParseableResponseFormat = function _ChatCompletionStream_getAutoParseableResponseFormat() {
        const responseFormat = __classPrivateFieldGet$1(this, _ChatCompletionStream_params, "f")?.response_format;
        if (isAutoParsableResponseFormat(responseFormat)) {
            return responseFormat;
        }
        return null;
    }, _ChatCompletionStream_accumulateChatCompletion = function _ChatCompletionStream_accumulateChatCompletion(chunk) {
        var _a, _b, _c, _d;
        let snapshot = __classPrivateFieldGet$1(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
        const { choices, ...rest } = chunk;
        if (!snapshot) {
            snapshot = __classPrivateFieldSet$1(this, _ChatCompletionStream_currentChatCompletionSnapshot, {
                ...rest,
                choices: [],
            }, "f");
        }
        else {
            Object.assign(snapshot, rest);
        }
        for (const { delta, finish_reason, index, logprobs = null, ...other } of chunk.choices) {
            let choice = snapshot.choices[index];
            if (!choice) {
                choice = snapshot.choices[index] = { finish_reason, index, message: {}, logprobs, ...other };
            }
            if (logprobs) {
                if (!choice.logprobs) {
                    choice.logprobs = Object.assign({}, logprobs);
                }
                else {
                    const { content, refusal, ...rest } = logprobs;
                    Object.assign(choice.logprobs, rest);
                    if (content) {
                        (_a = choice.logprobs).content ?? (_a.content = []);
                        choice.logprobs.content.push(...content);
                    }
                    if (refusal) {
                        (_b = choice.logprobs).refusal ?? (_b.refusal = []);
                        choice.logprobs.refusal.push(...refusal);
                    }
                }
            }
            if (finish_reason) {
                choice.finish_reason = finish_reason;
                if (__classPrivateFieldGet$1(this, _ChatCompletionStream_params, "f") && hasAutoParseableInput(__classPrivateFieldGet$1(this, _ChatCompletionStream_params, "f"))) {
                    if (finish_reason === 'length') {
                        throw new LengthFinishReasonError();
                    }
                    if (finish_reason === 'content_filter') {
                        throw new ContentFilterFinishReasonError();
                    }
                }
            }
            Object.assign(choice, other);
            if (!delta)
                continue; // Shouldn't happen; just in case.
            const { content, refusal, function_call, role, tool_calls, ...rest } = delta;
            Object.assign(choice.message, rest);
            if (refusal) {
                choice.message.refusal = (choice.message.refusal || '') + refusal;
            }
            if (role)
                choice.message.role = role;
            if (function_call) {
                if (!choice.message.function_call) {
                    choice.message.function_call = function_call;
                }
                else {
                    if (function_call.name)
                        choice.message.function_call.name = function_call.name;
                    if (function_call.arguments) {
                        (_c = choice.message.function_call).arguments ?? (_c.arguments = '');
                        choice.message.function_call.arguments += function_call.arguments;
                    }
                }
            }
            if (content) {
                choice.message.content = (choice.message.content || '') + content;
                if (!choice.message.refusal && __classPrivateFieldGet$1(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this)) {
                    choice.message.parsed = partialParse(choice.message.content);
                }
            }
            if (tool_calls) {
                if (!choice.message.tool_calls)
                    choice.message.tool_calls = [];
                for (const { index, id, type, function: fn, ...rest } of tool_calls) {
                    const tool_call = ((_d = choice.message.tool_calls)[index] ?? (_d[index] = {}));
                    Object.assign(tool_call, rest);
                    if (id)
                        tool_call.id = id;
                    if (type)
                        tool_call.type = type;
                    if (fn)
                        tool_call.function ?? (tool_call.function = { name: fn.name ?? '', arguments: '' });
                    if (fn?.name)
                        tool_call.function.name = fn.name;
                    if (fn?.arguments) {
                        tool_call.function.arguments += fn.arguments;
                        if (shouldParseToolCall(__classPrivateFieldGet$1(this, _ChatCompletionStream_params, "f"), tool_call)) {
                            tool_call.function.parsed_arguments = partialParse(tool_call.function.arguments);
                        }
                    }
                }
            }
        }
        return snapshot;
    }, Symbol.asyncIterator)]() {
        const pushQueue = [];
        const readQueue = [];
        let done = false;
        this.on('chunk', (chunk) => {
            const reader = readQueue.shift();
            if (reader) {
                reader.resolve(chunk);
            }
            else {
                pushQueue.push(chunk);
            }
        });
        this.on('end', () => {
            done = true;
            for (const reader of readQueue) {
                reader.resolve(undefined);
            }
            readQueue.length = 0;
        });
        this.on('abort', (err) => {
            done = true;
            for (const reader of readQueue) {
                reader.reject(err);
            }
            readQueue.length = 0;
        });
        this.on('error', (err) => {
            done = true;
            for (const reader of readQueue) {
                reader.reject(err);
            }
            readQueue.length = 0;
        });
        return {
            next: async () => {
                if (!pushQueue.length) {
                    if (done) {
                        return { value: undefined, done: true };
                    }
                    return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk) => (chunk ? { value: chunk, done: false } : { value: undefined, done: true }));
                }
                const chunk = pushQueue.shift();
                return { value: chunk, done: false };
            },
            return: async () => {
                this.abort();
                return { value: undefined, done: true };
            },
        };
    }
    toReadableStream() {
        const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
        return stream.toReadableStream();
    }
}
function finalizeChatCompletion(snapshot, params) {
    const { id, choices, created, model, system_fingerprint, ...rest } = snapshot;
    const completion = {
        ...rest,
        id,
        choices: choices.map(({ message, finish_reason, index, logprobs, ...choiceRest }) => {
            if (!finish_reason) {
                throw new OpenAIError(`missing finish_reason for choice ${index}`);
            }
            const { content = null, function_call, tool_calls, ...messageRest } = message;
            const role = message.role; // this is what we expect; in theory it could be different which would make our types a slight lie but would be fine.
            if (!role) {
                throw new OpenAIError(`missing role for choice ${index}`);
            }
            if (function_call) {
                const { arguments: args, name } = function_call;
                if (args == null) {
                    throw new OpenAIError(`missing function_call.arguments for choice ${index}`);
                }
                if (!name) {
                    throw new OpenAIError(`missing function_call.name for choice ${index}`);
                }
                return {
                    ...choiceRest,
                    message: {
                        content,
                        function_call: { arguments: args, name },
                        role,
                        refusal: message.refusal ?? null,
                    },
                    finish_reason,
                    index,
                    logprobs,
                };
            }
            if (tool_calls) {
                return {
                    ...choiceRest,
                    index,
                    finish_reason,
                    logprobs,
                    message: {
                        ...messageRest,
                        role,
                        content,
                        refusal: message.refusal ?? null,
                        tool_calls: tool_calls.map((tool_call, i) => {
                            const { function: fn, type, id, ...toolRest } = tool_call;
                            const { arguments: args, name, ...fnRest } = fn || {};
                            if (id == null) {
                                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].id\n${str(snapshot)}`);
                            }
                            if (type == null) {
                                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].type\n${str(snapshot)}`);
                            }
                            if (name == null) {
                                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.name\n${str(snapshot)}`);
                            }
                            if (args == null) {
                                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.arguments\n${str(snapshot)}`);
                            }
                            return { ...toolRest, id, type, function: { ...fnRest, name, arguments: args } };
                        }),
                    },
                };
            }
            return {
                ...choiceRest,
                message: { ...messageRest, content, role, refusal: message.refusal ?? null },
                finish_reason,
                index,
                logprobs,
            };
        }),
        created,
        model,
        object: 'chat.completion',
        ...(system_fingerprint ? { system_fingerprint } : {}),
    };
    return maybeParseChatCompletion(completion, params);
}
function str(x) {
    return JSON.stringify(x);
}
function assertNever(_x) { }

class ChatCompletionStreamingRunner extends ChatCompletionStream {
    static fromReadableStream(stream) {
        const runner = new ChatCompletionStreamingRunner(null);
        runner._run(() => runner._fromReadableStream(stream));
        return runner;
    }
    /** @deprecated - please use `runTools` instead. */
    static runFunctions(client, params, options) {
        const runner = new ChatCompletionStreamingRunner(null);
        const opts = {
            ...options,
            headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'runFunctions' },
        };
        runner._run(() => runner._runFunctions(client, params, opts));
        return runner;
    }
    static runTools(client, params, options) {
        const runner = new ChatCompletionStreamingRunner(
        // @ts-expect-error TODO these types are incompatible
        params);
        const opts = {
            ...options,
            headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'runTools' },
        };
        runner._run(() => runner._runTools(client, params, opts));
        return runner;
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Completions$1 = class Completions extends APIResource {
    parse(body, options) {
        validateInputTools(body.tools);
        return this._client.chat.completions
            .create(body, {
            ...options,
            headers: {
                ...options?.headers,
                'X-Stainless-Helper-Method': 'beta.chat.completions.parse',
            },
        })
            ._thenUnwrap((completion) => parseChatCompletion(completion, body));
    }
    runFunctions(body, options) {
        if (body.stream) {
            return ChatCompletionStreamingRunner.runFunctions(this._client, body, options);
        }
        return ChatCompletionRunner.runFunctions(this._client, body, options);
    }
    runTools(body, options) {
        if (body.stream) {
            return ChatCompletionStreamingRunner.runTools(this._client, body, options);
        }
        return ChatCompletionRunner.runTools(this._client, body, options);
    }
    /**
     * Creates a chat completion stream
     */
    stream(body, options) {
        return ChatCompletionStream.createChatCompletion(this._client, body, options);
    }
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Chat extends APIResource {
    constructor() {
        super(...arguments);
        this.completions = new Completions$1(this._client);
    }
}
(function (Chat) {
    Chat.Completions = Completions$1;
})(Chat || (Chat = {}));

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Sessions extends APIResource {
    /**
     * Create an ephemeral API token for use in client-side applications with the
     * Realtime API. Can be configured with the same session parameters as the
     * `session.update` client event.
     *
     * It responds with a session object, plus a `client_secret` key which contains a
     * usable ephemeral API token that can be used to authenticate browser clients for
     * the Realtime API.
     */
    create(body, options) {
        return this._client.post('/realtime/sessions', {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Realtime extends APIResource {
    constructor() {
        super(...arguments);
        this.sessions = new Sessions(this._client);
    }
}
Realtime.Sessions = Sessions;

var __classPrivateFieldGet = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _AssistantStream_instances, _AssistantStream_events, _AssistantStream_runStepSnapshots, _AssistantStream_messageSnapshots, _AssistantStream_messageSnapshot, _AssistantStream_finalRun, _AssistantStream_currentContentIndex, _AssistantStream_currentContent, _AssistantStream_currentToolCallIndex, _AssistantStream_currentToolCall, _AssistantStream_currentEvent, _AssistantStream_currentRunSnapshot, _AssistantStream_currentRunStepSnapshot, _AssistantStream_addEvent, _AssistantStream_endRequest, _AssistantStream_handleMessage, _AssistantStream_handleRunStep, _AssistantStream_handleEvent, _AssistantStream_accumulateRunStep, _AssistantStream_accumulateMessage, _AssistantStream_accumulateContent, _AssistantStream_handleRun;
class AssistantStream extends EventStream {
    constructor() {
        super(...arguments);
        _AssistantStream_instances.add(this);
        //Track all events in a single list for reference
        _AssistantStream_events.set(this, []);
        //Used to accumulate deltas
        //We are accumulating many types so the value here is not strict
        _AssistantStream_runStepSnapshots.set(this, {});
        _AssistantStream_messageSnapshots.set(this, {});
        _AssistantStream_messageSnapshot.set(this, void 0);
        _AssistantStream_finalRun.set(this, void 0);
        _AssistantStream_currentContentIndex.set(this, void 0);
        _AssistantStream_currentContent.set(this, void 0);
        _AssistantStream_currentToolCallIndex.set(this, void 0);
        _AssistantStream_currentToolCall.set(this, void 0);
        //For current snapshot methods
        _AssistantStream_currentEvent.set(this, void 0);
        _AssistantStream_currentRunSnapshot.set(this, void 0);
        _AssistantStream_currentRunStepSnapshot.set(this, void 0);
    }
    [(_AssistantStream_events = new WeakMap(), _AssistantStream_runStepSnapshots = new WeakMap(), _AssistantStream_messageSnapshots = new WeakMap(), _AssistantStream_messageSnapshot = new WeakMap(), _AssistantStream_finalRun = new WeakMap(), _AssistantStream_currentContentIndex = new WeakMap(), _AssistantStream_currentContent = new WeakMap(), _AssistantStream_currentToolCallIndex = new WeakMap(), _AssistantStream_currentToolCall = new WeakMap(), _AssistantStream_currentEvent = new WeakMap(), _AssistantStream_currentRunSnapshot = new WeakMap(), _AssistantStream_currentRunStepSnapshot = new WeakMap(), _AssistantStream_instances = new WeakSet(), Symbol.asyncIterator)]() {
        const pushQueue = [];
        const readQueue = [];
        let done = false;
        //Catch all for passing along all events
        this.on('event', (event) => {
            const reader = readQueue.shift();
            if (reader) {
                reader.resolve(event);
            }
            else {
                pushQueue.push(event);
            }
        });
        this.on('end', () => {
            done = true;
            for (const reader of readQueue) {
                reader.resolve(undefined);
            }
            readQueue.length = 0;
        });
        this.on('abort', (err) => {
            done = true;
            for (const reader of readQueue) {
                reader.reject(err);
            }
            readQueue.length = 0;
        });
        this.on('error', (err) => {
            done = true;
            for (const reader of readQueue) {
                reader.reject(err);
            }
            readQueue.length = 0;
        });
        return {
            next: async () => {
                if (!pushQueue.length) {
                    if (done) {
                        return { value: undefined, done: true };
                    }
                    return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk) => (chunk ? { value: chunk, done: false } : { value: undefined, done: true }));
                }
                const chunk = pushQueue.shift();
                return { value: chunk, done: false };
            },
            return: async () => {
                this.abort();
                return { value: undefined, done: true };
            },
        };
    }
    static fromReadableStream(stream) {
        const runner = new AssistantStream();
        runner._run(() => runner._fromReadableStream(stream));
        return runner;
    }
    async _fromReadableStream(readableStream, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        this._connected();
        const stream = Stream.fromReadableStream(readableStream, this.controller);
        for await (const event of stream) {
            __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError();
        }
        return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    toReadableStream() {
        const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
        return stream.toReadableStream();
    }
    static createToolAssistantStream(threadId, runId, runs, params, options) {
        const runner = new AssistantStream();
        runner._run(() => runner._runToolAssistantStream(threadId, runId, runs, params, {
            ...options,
            headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'stream' },
        }));
        return runner;
    }
    async _createToolAssistantStream(run, threadId, runId, params, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        const body = { ...params, stream: true };
        const stream = await run.submitToolOutputs(threadId, runId, body, {
            ...options,
            signal: this.controller.signal,
        });
        this._connected();
        for await (const event of stream) {
            __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError();
        }
        return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    static createThreadAssistantStream(params, thread, options) {
        const runner = new AssistantStream();
        runner._run(() => runner._threadAssistantStream(params, thread, {
            ...options,
            headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'stream' },
        }));
        return runner;
    }
    static createAssistantStream(threadId, runs, params, options) {
        const runner = new AssistantStream();
        runner._run(() => runner._runAssistantStream(threadId, runs, params, {
            ...options,
            headers: { ...options?.headers, 'X-Stainless-Helper-Method': 'stream' },
        }));
        return runner;
    }
    currentEvent() {
        return __classPrivateFieldGet(this, _AssistantStream_currentEvent, "f");
    }
    currentRun() {
        return __classPrivateFieldGet(this, _AssistantStream_currentRunSnapshot, "f");
    }
    currentMessageSnapshot() {
        return __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f");
    }
    currentRunStepSnapshot() {
        return __classPrivateFieldGet(this, _AssistantStream_currentRunStepSnapshot, "f");
    }
    async finalRunSteps() {
        await this.done();
        return Object.values(__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f"));
    }
    async finalMessages() {
        await this.done();
        return Object.values(__classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f"));
    }
    async finalRun() {
        await this.done();
        if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
            throw Error('Final run was not received.');
        return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
    }
    async _createThreadAssistantStream(thread, params, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        const body = { ...params, stream: true };
        const stream = await thread.createAndRun(body, { ...options, signal: this.controller.signal });
        this._connected();
        for await (const event of stream) {
            __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError();
        }
        return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    async _createAssistantStream(run, threadId, params, options) {
        const signal = options?.signal;
        if (signal) {
            if (signal.aborted)
                this.controller.abort();
            signal.addEventListener('abort', () => this.controller.abort());
        }
        const body = { ...params, stream: true };
        const stream = await run.create(threadId, body, { ...options, signal: this.controller.signal });
        this._connected();
        for await (const event of stream) {
            __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
        }
        if (stream.controller.signal?.aborted) {
            throw new APIUserAbortError();
        }
        return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    static accumulateDelta(acc, delta) {
        for (const [key, deltaValue] of Object.entries(delta)) {
            if (!acc.hasOwnProperty(key)) {
                acc[key] = deltaValue;
                continue;
            }
            let accValue = acc[key];
            if (accValue === null || accValue === undefined) {
                acc[key] = deltaValue;
                continue;
            }
            // We don't accumulate these special properties
            if (key === 'index' || key === 'type') {
                acc[key] = deltaValue;
                continue;
            }
            // Type-specific accumulation logic
            if (typeof accValue === 'string' && typeof deltaValue === 'string') {
                accValue += deltaValue;
            }
            else if (typeof accValue === 'number' && typeof deltaValue === 'number') {
                accValue += deltaValue;
            }
            else if (isObj(accValue) && isObj(deltaValue)) {
                accValue = this.accumulateDelta(accValue, deltaValue);
            }
            else if (Array.isArray(accValue) && Array.isArray(deltaValue)) {
                if (accValue.every((x) => typeof x === 'string' || typeof x === 'number')) {
                    accValue.push(...deltaValue); // Use spread syntax for efficient addition
                    continue;
                }
                for (const deltaEntry of deltaValue) {
                    if (!isObj(deltaEntry)) {
                        throw new Error(`Expected array delta entry to be an object but got: ${deltaEntry}`);
                    }
                    const index = deltaEntry['index'];
                    if (index == null) {
                        console.error(deltaEntry);
                        throw new Error('Expected array delta entry to have an `index` property');
                    }
                    if (typeof index !== 'number') {
                        throw new Error(`Expected array delta entry \`index\` property to be a number but got ${index}`);
                    }
                    const accEntry = accValue[index];
                    if (accEntry == null) {
                        accValue.push(deltaEntry);
                    }
                    else {
                        accValue[index] = this.accumulateDelta(accEntry, deltaEntry);
                    }
                }
                continue;
            }
            else {
                throw Error(`Unhandled record type: ${key}, deltaValue: ${deltaValue}, accValue: ${accValue}`);
            }
            acc[key] = accValue;
        }
        return acc;
    }
    _addRun(run) {
        return run;
    }
    async _threadAssistantStream(params, thread, options) {
        return await this._createThreadAssistantStream(thread, params, options);
    }
    async _runAssistantStream(threadId, runs, params, options) {
        return await this._createAssistantStream(runs, threadId, params, options);
    }
    async _runToolAssistantStream(threadId, runId, runs, params, options) {
        return await this._createToolAssistantStream(runs, threadId, runId, params, options);
    }
}
_AssistantStream_addEvent = function _AssistantStream_addEvent(event) {
    if (this.ended)
        return;
    __classPrivateFieldSet(this, _AssistantStream_currentEvent, event, "f");
    __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleEvent).call(this, event);
    switch (event.event) {
        case 'thread.created':
            //No action on this event.
            break;
        case 'thread.run.created':
        case 'thread.run.queued':
        case 'thread.run.in_progress':
        case 'thread.run.requires_action':
        case 'thread.run.completed':
        case 'thread.run.incomplete':
        case 'thread.run.failed':
        case 'thread.run.cancelling':
        case 'thread.run.cancelled':
        case 'thread.run.expired':
            __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRun).call(this, event);
            break;
        case 'thread.run.step.created':
        case 'thread.run.step.in_progress':
        case 'thread.run.step.delta':
        case 'thread.run.step.completed':
        case 'thread.run.step.failed':
        case 'thread.run.step.cancelled':
        case 'thread.run.step.expired':
            __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRunStep).call(this, event);
            break;
        case 'thread.message.created':
        case 'thread.message.in_progress':
        case 'thread.message.delta':
        case 'thread.message.completed':
        case 'thread.message.incomplete':
            __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleMessage).call(this, event);
            break;
        case 'error':
            //This is included for completeness, but errors are processed in the SSE event processing so this should not occur
            throw new Error('Encountered an error event in event processing - errors should be processed earlier');
    }
}, _AssistantStream_endRequest = function _AssistantStream_endRequest() {
    if (this.ended) {
        throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
        throw Error('Final run has not been received');
    return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
}, _AssistantStream_handleMessage = function _AssistantStream_handleMessage(event) {
    const [accumulatedMessage, newContent] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateMessage).call(this, event, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
    __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, accumulatedMessage, "f");
    __classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f")[accumulatedMessage.id] = accumulatedMessage;
    for (const content of newContent) {
        const snapshotContent = accumulatedMessage.content[content.index];
        if (snapshotContent?.type == 'text') {
            this._emit('textCreated', snapshotContent.text);
        }
    }
    switch (event.event) {
        case 'thread.message.created':
            this._emit('messageCreated', event.data);
            break;
        case 'thread.message.in_progress':
            break;
        case 'thread.message.delta':
            this._emit('messageDelta', event.data.delta, accumulatedMessage);
            if (event.data.delta.content) {
                for (const content of event.data.delta.content) {
                    //If it is text delta, emit a text delta event
                    if (content.type == 'text' && content.text) {
                        let textDelta = content.text;
                        let snapshot = accumulatedMessage.content[content.index];
                        if (snapshot && snapshot.type == 'text') {
                            this._emit('textDelta', textDelta, snapshot.text);
                        }
                        else {
                            throw Error('The snapshot associated with this text delta is not text or missing');
                        }
                    }
                    if (content.index != __classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")) {
                        //See if we have in progress content
                        if (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f")) {
                            switch (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f").type) {
                                case 'text':
                                    this._emit('textDone', __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                                    break;
                                case 'image_file':
                                    this._emit('imageFileDone', __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                                    break;
                            }
                        }
                        __classPrivateFieldSet(this, _AssistantStream_currentContentIndex, content.index, "f");
                    }
                    __classPrivateFieldSet(this, _AssistantStream_currentContent, accumulatedMessage.content[content.index], "f");
                }
            }
            break;
        case 'thread.message.completed':
        case 'thread.message.incomplete':
            //We emit the latest content we were working on on completion (including incomplete)
            if (__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f") !== undefined) {
                const currentContent = event.data.content[__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")];
                if (currentContent) {
                    switch (currentContent.type) {
                        case 'image_file':
                            this._emit('imageFileDone', currentContent.image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                            break;
                        case 'text':
                            this._emit('textDone', currentContent.text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                            break;
                    }
                }
            }
            if (__classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f")) {
                this._emit('messageDone', event.data);
            }
            __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, undefined, "f");
    }
}, _AssistantStream_handleRunStep = function _AssistantStream_handleRunStep(event) {
    const accumulatedRunStep = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateRunStep).call(this, event);
    __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, accumulatedRunStep, "f");
    switch (event.event) {
        case 'thread.run.step.created':
            this._emit('runStepCreated', event.data);
            break;
        case 'thread.run.step.delta':
            const delta = event.data.delta;
            if (delta.step_details &&
                delta.step_details.type == 'tool_calls' &&
                delta.step_details.tool_calls &&
                accumulatedRunStep.step_details.type == 'tool_calls') {
                for (const toolCall of delta.step_details.tool_calls) {
                    if (toolCall.index == __classPrivateFieldGet(this, _AssistantStream_currentToolCallIndex, "f")) {
                        this._emit('toolCallDelta', toolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index]);
                    }
                    else {
                        if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
                            this._emit('toolCallDone', __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
                        }
                        __classPrivateFieldSet(this, _AssistantStream_currentToolCallIndex, toolCall.index, "f");
                        __classPrivateFieldSet(this, _AssistantStream_currentToolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index], "f");
                        if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"))
                            this._emit('toolCallCreated', __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
                    }
                }
            }
            this._emit('runStepDelta', event.data.delta, accumulatedRunStep);
            break;
        case 'thread.run.step.completed':
        case 'thread.run.step.failed':
        case 'thread.run.step.cancelled':
        case 'thread.run.step.expired':
            __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, undefined, "f");
            const details = event.data.step_details;
            if (details.type == 'tool_calls') {
                if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
                    this._emit('toolCallDone', __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
                    __classPrivateFieldSet(this, _AssistantStream_currentToolCall, undefined, "f");
                }
            }
            this._emit('runStepDone', event.data, accumulatedRunStep);
            break;
    }
}, _AssistantStream_handleEvent = function _AssistantStream_handleEvent(event) {
    __classPrivateFieldGet(this, _AssistantStream_events, "f").push(event);
    this._emit('event', event);
}, _AssistantStream_accumulateRunStep = function _AssistantStream_accumulateRunStep(event) {
    switch (event.event) {
        case 'thread.run.step.created':
            __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
            return event.data;
        case 'thread.run.step.delta':
            let snapshot = __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
            if (!snapshot) {
                throw Error('Received a RunStepDelta before creation of a snapshot');
            }
            let data = event.data;
            if (data.delta) {
                const accumulated = AssistantStream.accumulateDelta(snapshot, data.delta);
                __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = accumulated;
            }
            return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
        case 'thread.run.step.completed':
        case 'thread.run.step.failed':
        case 'thread.run.step.cancelled':
        case 'thread.run.step.expired':
        case 'thread.run.step.in_progress':
            __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
            break;
    }
    if (__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id])
        return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
    throw new Error('No snapshot available');
}, _AssistantStream_accumulateMessage = function _AssistantStream_accumulateMessage(event, snapshot) {
    let newContent = [];
    switch (event.event) {
        case 'thread.message.created':
            //On creation the snapshot is just the initial message
            return [event.data, newContent];
        case 'thread.message.delta':
            if (!snapshot) {
                throw Error('Received a delta with no existing snapshot (there should be one from message creation)');
            }
            let data = event.data;
            //If this delta does not have content, nothing to process
            if (data.delta.content) {
                for (const contentElement of data.delta.content) {
                    if (contentElement.index in snapshot.content) {
                        let currentContent = snapshot.content[contentElement.index];
                        snapshot.content[contentElement.index] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateContent).call(this, contentElement, currentContent);
                    }
                    else {
                        snapshot.content[contentElement.index] = contentElement;
                        // This is a new element
                        newContent.push(contentElement);
                    }
                }
            }
            return [snapshot, newContent];
        case 'thread.message.in_progress':
        case 'thread.message.completed':
        case 'thread.message.incomplete':
            //No changes on other thread events
            if (snapshot) {
                return [snapshot, newContent];
            }
            else {
                throw Error('Received thread message event with no existing snapshot');
            }
    }
    throw Error('Tried to accumulate a non-message event');
}, _AssistantStream_accumulateContent = function _AssistantStream_accumulateContent(contentElement, currentContent) {
    return AssistantStream.accumulateDelta(currentContent, contentElement);
}, _AssistantStream_handleRun = function _AssistantStream_handleRun(event) {
    __classPrivateFieldSet(this, _AssistantStream_currentRunSnapshot, event.data, "f");
    switch (event.event) {
        case 'thread.run.created':
            break;
        case 'thread.run.queued':
            break;
        case 'thread.run.in_progress':
            break;
        case 'thread.run.requires_action':
        case 'thread.run.cancelled':
        case 'thread.run.failed':
        case 'thread.run.completed':
        case 'thread.run.expired':
            __classPrivateFieldSet(this, _AssistantStream_finalRun, event.data, "f");
            if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
                this._emit('toolCallDone', __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
                __classPrivateFieldSet(this, _AssistantStream_currentToolCall, undefined, "f");
            }
            break;
    }
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Messages extends APIResource {
    /**
     * Create a message.
     */
    create(threadId, body, options) {
        return this._client.post(`/threads/${threadId}/messages`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Retrieve a message.
     */
    retrieve(threadId, messageId, options) {
        return this._client.get(`/threads/${threadId}/messages/${messageId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Modifies a message.
     */
    update(threadId, messageId, body, options) {
        return this._client.post(`/threads/${threadId}/messages/${messageId}`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    list(threadId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list(threadId, {}, query);
        }
        return this._client.getAPIList(`/threads/${threadId}/messages`, MessagesPage, {
            query,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Deletes a message.
     */
    del(threadId, messageId, options) {
        return this._client.delete(`/threads/${threadId}/messages/${messageId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
}
class MessagesPage extends CursorPage {
}
Messages.MessagesPage = MessagesPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Steps extends APIResource {
    retrieve(threadId, runId, stepId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.retrieve(threadId, runId, stepId, {}, query);
        }
        return this._client.get(`/threads/${threadId}/runs/${runId}/steps/${stepId}`, {
            query,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    list(threadId, runId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list(threadId, runId, {}, query);
        }
        return this._client.getAPIList(`/threads/${threadId}/runs/${runId}/steps`, RunStepsPage, {
            query,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
}
class RunStepsPage extends CursorPage {
}
Steps.RunStepsPage = RunStepsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Runs extends APIResource {
    constructor() {
        super(...arguments);
        this.steps = new Steps(this._client);
    }
    create(threadId, params, options) {
        const { include, ...body } = params;
        return this._client.post(`/threads/${threadId}/runs`, {
            query: { include },
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
            stream: params.stream ?? false,
        });
    }
    /**
     * Retrieves a run.
     */
    retrieve(threadId, runId, options) {
        return this._client.get(`/threads/${threadId}/runs/${runId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Modifies a run.
     */
    update(threadId, runId, body, options) {
        return this._client.post(`/threads/${threadId}/runs/${runId}`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    list(threadId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list(threadId, {}, query);
        }
        return this._client.getAPIList(`/threads/${threadId}/runs`, RunsPage, {
            query,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Cancels a run that is `in_progress`.
     */
    cancel(threadId, runId, options) {
        return this._client.post(`/threads/${threadId}/runs/${runId}/cancel`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * A helper to create a run an poll for a terminal state. More information on Run
     * lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async createAndPoll(threadId, body, options) {
        const run = await this.create(threadId, body, options);
        return await this.poll(threadId, run.id, options);
    }
    /**
     * Create a Run stream
     *
     * @deprecated use `stream` instead
     */
    createAndStream(threadId, body, options) {
        return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
    }
    /**
     * A helper to poll a run status until it reaches a terminal state. More
     * information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async poll(threadId, runId, options) {
        const headers = { ...options?.headers, 'X-Stainless-Poll-Helper': 'true' };
        if (options?.pollIntervalMs) {
            headers['X-Stainless-Custom-Poll-Interval'] = options.pollIntervalMs.toString();
        }
        while (true) {
            const { data: run, response } = await this.retrieve(threadId, runId, {
                ...options,
                headers: { ...options?.headers, ...headers },
            }).withResponse();
            switch (run.status) {
                //If we are in any sort of intermediate state we poll
                case 'queued':
                case 'in_progress':
                case 'cancelling':
                    let sleepInterval = 5000;
                    if (options?.pollIntervalMs) {
                        sleepInterval = options.pollIntervalMs;
                    }
                    else {
                        const headerInterval = response.headers.get('openai-poll-after-ms');
                        if (headerInterval) {
                            const headerIntervalMs = parseInt(headerInterval);
                            if (!isNaN(headerIntervalMs)) {
                                sleepInterval = headerIntervalMs;
                            }
                        }
                    }
                    await sleep(sleepInterval);
                    break;
                //We return the run in any terminal state.
                case 'requires_action':
                case 'incomplete':
                case 'cancelled':
                case 'completed':
                case 'failed':
                case 'expired':
                    return run;
            }
        }
    }
    /**
     * Create a Run stream
     */
    stream(threadId, body, options) {
        return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
    }
    submitToolOutputs(threadId, runId, body, options) {
        return this._client.post(`/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
            stream: body.stream ?? false,
        });
    }
    /**
     * A helper to submit a tool output to a run and poll for a terminal run state.
     * More information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async submitToolOutputsAndPoll(threadId, runId, body, options) {
        const run = await this.submitToolOutputs(threadId, runId, body, options);
        return await this.poll(threadId, run.id, options);
    }
    /**
     * Submit the tool outputs from a previous run and stream the run to a terminal
     * state. More information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    submitToolOutputsStream(threadId, runId, body, options) {
        return AssistantStream.createToolAssistantStream(threadId, runId, this._client.beta.threads.runs, body, options);
    }
}
class RunsPage extends CursorPage {
}
Runs.RunsPage = RunsPage;
Runs.Steps = Steps;
Runs.RunStepsPage = RunStepsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Threads extends APIResource {
    constructor() {
        super(...arguments);
        this.runs = new Runs(this._client);
        this.messages = new Messages(this._client);
    }
    create(body = {}, options) {
        if (isRequestOptions(body)) {
            return this.create({}, body);
        }
        return this._client.post('/threads', {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Retrieves a thread.
     */
    retrieve(threadId, options) {
        return this._client.get(`/threads/${threadId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Modifies a thread.
     */
    update(threadId, body, options) {
        return this._client.post(`/threads/${threadId}`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Delete a thread.
     */
    del(threadId, options) {
        return this._client.delete(`/threads/${threadId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    createAndRun(body, options) {
        return this._client.post('/threads/runs', {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
            stream: body.stream ?? false,
        });
    }
    /**
     * A helper to create a thread, start a run and then poll for a terminal state.
     * More information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async createAndRunPoll(body, options) {
        const run = await this.createAndRun(body, options);
        return await this.runs.poll(run.thread_id, run.id, options);
    }
    /**
     * Create a thread and stream the run back
     */
    createAndRunStream(body, options) {
        return AssistantStream.createThreadAssistantStream(body, this._client.beta.threads, options);
    }
}
Threads.Runs = Runs;
Threads.RunsPage = RunsPage;
Threads.Messages = Messages;
Threads.MessagesPage = MessagesPage;

/**
 * Like `Promise.allSettled()` but throws an error if any promises are rejected.
 */
const allSettledWithThrow = async (promises) => {
    const results = await Promise.allSettled(promises);
    const rejected = results.filter((result) => result.status === 'rejected');
    if (rejected.length) {
        for (const result of rejected) {
            console.error(result.reason);
        }
        throw new Error(`${rejected.length} promise(s) failed - see the above errors`);
    }
    // Note: TS was complaining about using `.filter().map()` here for some reason
    const values = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            values.push(result.value);
        }
    }
    return values;
};

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
let Files$1 = class Files extends APIResource {
    /**
     * Create a vector store file by attaching a
     * [File](https://platform.openai.com/docs/api-reference/files) to a
     * [vector store](https://platform.openai.com/docs/api-reference/vector-stores/object).
     */
    create(vectorStoreId, body, options) {
        return this._client.post(`/vector_stores/${vectorStoreId}/files`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Retrieves a vector store file.
     */
    retrieve(vectorStoreId, fileId, options) {
        return this._client.get(`/vector_stores/${vectorStoreId}/files/${fileId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    list(vectorStoreId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list(vectorStoreId, {}, query);
        }
        return this._client.getAPIList(`/vector_stores/${vectorStoreId}/files`, VectorStoreFilesPage, {
            query,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Delete a vector store file. This will remove the file from the vector store but
     * the file itself will not be deleted. To delete the file, use the
     * [delete file](https://platform.openai.com/docs/api-reference/files/delete)
     * endpoint.
     */
    del(vectorStoreId, fileId, options) {
        return this._client.delete(`/vector_stores/${vectorStoreId}/files/${fileId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Attach a file to the given vector store and wait for it to be processed.
     */
    async createAndPoll(vectorStoreId, body, options) {
        const file = await this.create(vectorStoreId, body, options);
        return await this.poll(vectorStoreId, file.id, options);
    }
    /**
     * Wait for the vector store file to finish processing.
     *
     * Note: this will return even if the file failed to process, you need to check
     * file.last_error and file.status to handle these cases
     */
    async poll(vectorStoreId, fileId, options) {
        const headers = { ...options?.headers, 'X-Stainless-Poll-Helper': 'true' };
        if (options?.pollIntervalMs) {
            headers['X-Stainless-Custom-Poll-Interval'] = options.pollIntervalMs.toString();
        }
        while (true) {
            const fileResponse = await this.retrieve(vectorStoreId, fileId, {
                ...options,
                headers,
            }).withResponse();
            const file = fileResponse.data;
            switch (file.status) {
                case 'in_progress':
                    let sleepInterval = 5000;
                    if (options?.pollIntervalMs) {
                        sleepInterval = options.pollIntervalMs;
                    }
                    else {
                        const headerInterval = fileResponse.response.headers.get('openai-poll-after-ms');
                        if (headerInterval) {
                            const headerIntervalMs = parseInt(headerInterval);
                            if (!isNaN(headerIntervalMs)) {
                                sleepInterval = headerIntervalMs;
                            }
                        }
                    }
                    await sleep(sleepInterval);
                    break;
                case 'failed':
                case 'completed':
                    return file;
            }
        }
    }
    /**
     * Upload a file to the `files` API and then attach it to the given vector store.
     *
     * Note the file will be asynchronously processed (you can use the alternative
     * polling helper method to wait for processing to complete).
     */
    async upload(vectorStoreId, file, options) {
        const fileInfo = await this._client.files.create({ file: file, purpose: 'assistants' }, options);
        return this.create(vectorStoreId, { file_id: fileInfo.id }, options);
    }
    /**
     * Add a file to a vector store and poll until processing is complete.
     */
    async uploadAndPoll(vectorStoreId, file, options) {
        const fileInfo = await this.upload(vectorStoreId, file, options);
        return await this.poll(vectorStoreId, fileInfo.id, options);
    }
};
class VectorStoreFilesPage extends CursorPage {
}
Files$1.VectorStoreFilesPage = VectorStoreFilesPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class FileBatches extends APIResource {
    /**
     * Create a vector store file batch.
     */
    create(vectorStoreId, body, options) {
        return this._client.post(`/vector_stores/${vectorStoreId}/file_batches`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Retrieves a vector store file batch.
     */
    retrieve(vectorStoreId, batchId, options) {
        return this._client.get(`/vector_stores/${vectorStoreId}/file_batches/${batchId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Cancel a vector store file batch. This attempts to cancel the processing of
     * files in this batch as soon as possible.
     */
    cancel(vectorStoreId, batchId, options) {
        return this._client.post(`/vector_stores/${vectorStoreId}/file_batches/${batchId}/cancel`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Create a vector store batch and poll until all files have been processed.
     */
    async createAndPoll(vectorStoreId, body, options) {
        const batch = await this.create(vectorStoreId, body);
        return await this.poll(vectorStoreId, batch.id, options);
    }
    listFiles(vectorStoreId, batchId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.listFiles(vectorStoreId, batchId, {}, query);
        }
        return this._client.getAPIList(`/vector_stores/${vectorStoreId}/file_batches/${batchId}/files`, VectorStoreFilesPage, { query, ...options, headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers } });
    }
    /**
     * Wait for the given file batch to be processed.
     *
     * Note: this will return even if one of the files failed to process, you need to
     * check batch.file_counts.failed_count to handle this case.
     */
    async poll(vectorStoreId, batchId, options) {
        const headers = { ...options?.headers, 'X-Stainless-Poll-Helper': 'true' };
        if (options?.pollIntervalMs) {
            headers['X-Stainless-Custom-Poll-Interval'] = options.pollIntervalMs.toString();
        }
        while (true) {
            const { data: batch, response } = await this.retrieve(vectorStoreId, batchId, {
                ...options,
                headers,
            }).withResponse();
            switch (batch.status) {
                case 'in_progress':
                    let sleepInterval = 5000;
                    if (options?.pollIntervalMs) {
                        sleepInterval = options.pollIntervalMs;
                    }
                    else {
                        const headerInterval = response.headers.get('openai-poll-after-ms');
                        if (headerInterval) {
                            const headerIntervalMs = parseInt(headerInterval);
                            if (!isNaN(headerIntervalMs)) {
                                sleepInterval = headerIntervalMs;
                            }
                        }
                    }
                    await sleep(sleepInterval);
                    break;
                case 'failed':
                case 'cancelled':
                case 'completed':
                    return batch;
            }
        }
    }
    /**
     * Uploads the given files concurrently and then creates a vector store file batch.
     *
     * The concurrency limit is configurable using the `maxConcurrency` parameter.
     */
    async uploadAndPoll(vectorStoreId, { files, fileIds = [] }, options) {
        if (files == null || files.length == 0) {
            throw new Error(`No \`files\` provided to process. If you've already uploaded files you should use \`.createAndPoll()\` instead`);
        }
        const configuredConcurrency = options?.maxConcurrency ?? 5;
        // We cap the number of workers at the number of files (so we don't start any unnecessary workers)
        const concurrencyLimit = Math.min(configuredConcurrency, files.length);
        const client = this._client;
        const fileIterator = files.values();
        const allFileIds = [...fileIds];
        // This code is based on this design. The libraries don't accommodate our environment limits.
        // https://stackoverflow.com/questions/40639432/what-is-the-best-way-to-limit-concurrency-when-using-es6s-promise-all
        async function processFiles(iterator) {
            for (let item of iterator) {
                const fileObj = await client.files.create({ file: item, purpose: 'assistants' }, options);
                allFileIds.push(fileObj.id);
            }
        }
        // Start workers to process results
        const workers = Array(concurrencyLimit).fill(fileIterator).map(processFiles);
        // Wait for all processing to complete.
        await allSettledWithThrow(workers);
        return await this.createAndPoll(vectorStoreId, {
            file_ids: allFileIds,
        });
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class VectorStores extends APIResource {
    constructor() {
        super(...arguments);
        this.files = new Files$1(this._client);
        this.fileBatches = new FileBatches(this._client);
    }
    /**
     * Create a vector store.
     */
    create(body, options) {
        return this._client.post('/vector_stores', {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Retrieves a vector store.
     */
    retrieve(vectorStoreId, options) {
        return this._client.get(`/vector_stores/${vectorStoreId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Modifies a vector store.
     */
    update(vectorStoreId, body, options) {
        return this._client.post(`/vector_stores/${vectorStoreId}`, {
            body,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    list(query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/vector_stores', VectorStoresPage, {
            query,
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
    /**
     * Delete a vector store.
     */
    del(vectorStoreId, options) {
        return this._client.delete(`/vector_stores/${vectorStoreId}`, {
            ...options,
            headers: { 'OpenAI-Beta': 'assistants=v2', ...options?.headers },
        });
    }
}
class VectorStoresPage extends CursorPage {
}
VectorStores.VectorStoresPage = VectorStoresPage;
VectorStores.Files = Files$1;
VectorStores.VectorStoreFilesPage = VectorStoreFilesPage;
VectorStores.FileBatches = FileBatches;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Beta extends APIResource {
    constructor() {
        super(...arguments);
        this.realtime = new Realtime(this._client);
        this.vectorStores = new VectorStores(this._client);
        this.chat = new Chat(this._client);
        this.assistants = new Assistants(this._client);
        this.threads = new Threads(this._client);
    }
}
Beta.Realtime = Realtime;
Beta.VectorStores = VectorStores;
Beta.VectorStoresPage = VectorStoresPage;
Beta.Assistants = Assistants;
Beta.AssistantsPage = AssistantsPage;
Beta.Threads = Threads;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Completions extends APIResource {
    create(body, options) {
        return this._client.post('/completions', { body, ...options, stream: body.stream ?? false });
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Embeddings extends APIResource {
    /**
     * Creates an embedding vector representing the input text.
     */
    create(body, options) {
        return this._client.post('/embeddings', { body, ...options });
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Files extends APIResource {
    /**
     * Upload a file that can be used across various endpoints. Individual files can be
     * up to 512 MB, and the size of all files uploaded by one organization can be up
     * to 100 GB.
     *
     * The Assistants API supports files up to 2 million tokens and of specific file
     * types. See the
     * [Assistants Tools guide](https://platform.openai.com/docs/assistants/tools) for
     * details.
     *
     * The Fine-tuning API only supports `.jsonl` files. The input also has certain
     * required formats for fine-tuning
     * [chat](https://platform.openai.com/docs/api-reference/fine-tuning/chat-input) or
     * [completions](https://platform.openai.com/docs/api-reference/fine-tuning/completions-input)
     * models.
     *
     * The Batch API only supports `.jsonl` files up to 200 MB in size. The input also
     * has a specific required
     * [format](https://platform.openai.com/docs/api-reference/batch/request-input).
     *
     * Please [contact us](https://help.openai.com/) if you need to increase these
     * storage limits.
     */
    create(body, options) {
        return this._client.post('/files', multipartFormRequestOptions({ body, ...options }));
    }
    /**
     * Returns information about a specific file.
     */
    retrieve(fileId, options) {
        return this._client.get(`/files/${fileId}`, options);
    }
    list(query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/files', FileObjectsPage, { query, ...options });
    }
    /**
     * Delete a file.
     */
    del(fileId, options) {
        return this._client.delete(`/files/${fileId}`, options);
    }
    /**
     * Returns the contents of the specified file.
     */
    content(fileId, options) {
        return this._client.get(`/files/${fileId}/content`, {
            ...options,
            headers: { Accept: 'application/binary', ...options?.headers },
            __binaryResponse: true,
        });
    }
    /**
     * Returns the contents of the specified file.
     *
     * @deprecated The `.content()` method should be used instead
     */
    retrieveContent(fileId, options) {
        return this._client.get(`/files/${fileId}/content`, options);
    }
    /**
     * Waits for the given file to be processed, default timeout is 30 mins.
     */
    async waitForProcessing(id, { pollInterval = 5000, maxWait = 30 * 60 * 1000 } = {}) {
        const TERMINAL_STATES = new Set(['processed', 'error', 'deleted']);
        const start = Date.now();
        let file = await this.retrieve(id);
        while (!file.status || !TERMINAL_STATES.has(file.status)) {
            await sleep(pollInterval);
            file = await this.retrieve(id);
            if (Date.now() - start > maxWait) {
                throw new APIConnectionTimeoutError({
                    message: `Giving up on waiting for file ${id} to finish processing after ${maxWait} milliseconds.`,
                });
            }
        }
        return file;
    }
}
class FileObjectsPage extends CursorPage {
}
Files.FileObjectsPage = FileObjectsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Checkpoints extends APIResource {
    list(fineTuningJobId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list(fineTuningJobId, {}, query);
        }
        return this._client.getAPIList(`/fine_tuning/jobs/${fineTuningJobId}/checkpoints`, FineTuningJobCheckpointsPage, { query, ...options });
    }
}
class FineTuningJobCheckpointsPage extends CursorPage {
}
Checkpoints.FineTuningJobCheckpointsPage = FineTuningJobCheckpointsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Jobs extends APIResource {
    constructor() {
        super(...arguments);
        this.checkpoints = new Checkpoints(this._client);
    }
    /**
     * Creates a fine-tuning job which begins the process of creating a new model from
     * a given dataset.
     *
     * Response includes details of the enqueued job including job status and the name
     * of the fine-tuned models once complete.
     *
     * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/fine-tuning)
     */
    create(body, options) {
        return this._client.post('/fine_tuning/jobs', { body, ...options });
    }
    /**
     * Get info about a fine-tuning job.
     *
     * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/fine-tuning)
     */
    retrieve(fineTuningJobId, options) {
        return this._client.get(`/fine_tuning/jobs/${fineTuningJobId}`, options);
    }
    list(query = {}, options) {
        if (isRequestOptions(query)) {
            return this.list({}, query);
        }
        return this._client.getAPIList('/fine_tuning/jobs', FineTuningJobsPage, { query, ...options });
    }
    /**
     * Immediately cancel a fine-tune job.
     */
    cancel(fineTuningJobId, options) {
        return this._client.post(`/fine_tuning/jobs/${fineTuningJobId}/cancel`, options);
    }
    listEvents(fineTuningJobId, query = {}, options) {
        if (isRequestOptions(query)) {
            return this.listEvents(fineTuningJobId, {}, query);
        }
        return this._client.getAPIList(`/fine_tuning/jobs/${fineTuningJobId}/events`, FineTuningJobEventsPage, {
            query,
            ...options,
        });
    }
}
class FineTuningJobsPage extends CursorPage {
}
class FineTuningJobEventsPage extends CursorPage {
}
Jobs.FineTuningJobsPage = FineTuningJobsPage;
Jobs.FineTuningJobEventsPage = FineTuningJobEventsPage;
Jobs.Checkpoints = Checkpoints;
Jobs.FineTuningJobCheckpointsPage = FineTuningJobCheckpointsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class FineTuning extends APIResource {
    constructor() {
        super(...arguments);
        this.jobs = new Jobs(this._client);
    }
}
FineTuning.Jobs = Jobs;
FineTuning.FineTuningJobsPage = FineTuningJobsPage;
FineTuning.FineTuningJobEventsPage = FineTuningJobEventsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Images extends APIResource {
    /**
     * Creates a variation of a given image.
     */
    createVariation(body, options) {
        return this._client.post('/images/variations', multipartFormRequestOptions({ body, ...options }));
    }
    /**
     * Creates an edited or extended image given an original image and a prompt.
     */
    edit(body, options) {
        return this._client.post('/images/edits', multipartFormRequestOptions({ body, ...options }));
    }
    /**
     * Creates an image given a prompt.
     */
    generate(body, options) {
        return this._client.post('/images/generations', { body, ...options });
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Models extends APIResource {
    /**
     * Retrieves a model instance, providing basic information about the model such as
     * the owner and permissioning.
     */
    retrieve(model, options) {
        return this._client.get(`/models/${model}`, options);
    }
    /**
     * Lists the currently available models, and provides basic information about each
     * one such as the owner and availability.
     */
    list(options) {
        return this._client.getAPIList('/models', ModelsPage, options);
    }
    /**
     * Delete a fine-tuned model. You must have the Owner role in your organization to
     * delete a model.
     */
    del(model, options) {
        return this._client.delete(`/models/${model}`, options);
    }
}
/**
 * Note: no pagination actually occurs yet, this is for forwards-compatibility.
 */
class ModelsPage extends Page {
}
Models.ModelsPage = ModelsPage;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Moderations extends APIResource {
    /**
     * Classifies if text and/or image inputs are potentially harmful. Learn more in
     * the [moderation guide](https://platform.openai.com/docs/guides/moderation).
     */
    create(body, options) {
        return this._client.post('/moderations', { body, ...options });
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Parts extends APIResource {
    /**
     * Adds a
     * [Part](https://platform.openai.com/docs/api-reference/uploads/part-object) to an
     * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object.
     * A Part represents a chunk of bytes from the file you are trying to upload.
     *
     * Each Part can be at most 64 MB, and you can add Parts until you hit the Upload
     * maximum of 8 GB.
     *
     * It is possible to add multiple Parts in parallel. You can decide the intended
     * order of the Parts when you
     * [complete the Upload](https://platform.openai.com/docs/api-reference/uploads/complete).
     */
    create(uploadId, body, options) {
        return this._client.post(`/uploads/${uploadId}/parts`, multipartFormRequestOptions({ body, ...options }));
    }
}

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
class Uploads extends APIResource {
    constructor() {
        super(...arguments);
        this.parts = new Parts(this._client);
    }
    /**
     * Creates an intermediate
     * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object
     * that you can add
     * [Parts](https://platform.openai.com/docs/api-reference/uploads/part-object) to.
     * Currently, an Upload can accept at most 8 GB in total and expires after an hour
     * after you create it.
     *
     * Once you complete the Upload, we will create a
     * [File](https://platform.openai.com/docs/api-reference/files/object) object that
     * contains all the parts you uploaded. This File is usable in the rest of our
     * platform as a regular File object.
     *
     * For certain `purpose`s, the correct `mime_type` must be specified. Please refer
     * to documentation for the supported MIME types for your use case:
     *
     * - [Assistants](https://platform.openai.com/docs/assistants/tools/file-search#supported-files)
     *
     * For guidance on the proper filename extensions for each purpose, please follow
     * the documentation on
     * [creating a File](https://platform.openai.com/docs/api-reference/files/create).
     */
    create(body, options) {
        return this._client.post('/uploads', { body, ...options });
    }
    /**
     * Cancels the Upload. No Parts may be added after an Upload is cancelled.
     */
    cancel(uploadId, options) {
        return this._client.post(`/uploads/${uploadId}/cancel`, options);
    }
    /**
     * Completes the
     * [Upload](https://platform.openai.com/docs/api-reference/uploads/object).
     *
     * Within the returned Upload object, there is a nested
     * [File](https://platform.openai.com/docs/api-reference/files/object) object that
     * is ready to use in the rest of the platform.
     *
     * You can specify the order of the Parts by passing in an ordered list of the Part
     * IDs.
     *
     * The number of bytes uploaded upon completion must match the number of bytes
     * initially specified when creating the Upload object. No Parts may be added after
     * an Upload is completed.
     */
    complete(uploadId, body, options) {
        return this._client.post(`/uploads/${uploadId}/complete`, { body, ...options });
    }
}
Uploads.Parts = Parts;

// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
var _a;
/**
 * API Client for interfacing with the OpenAI API.
 */
class OpenAI extends APIClient {
    /**
     * API Client for interfacing with the OpenAI API.
     *
     * @param {string | undefined} [opts.apiKey=process.env['OPENAI_API_KEY'] ?? undefined]
     * @param {string | null | undefined} [opts.organization=process.env['OPENAI_ORG_ID'] ?? null]
     * @param {string | null | undefined} [opts.project=process.env['OPENAI_PROJECT_ID'] ?? null]
     * @param {string} [opts.baseURL=process.env['OPENAI_BASE_URL'] ?? https://api.openai.com/v1] - Override the default base URL for the API.
     * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
     * @param {number} [opts.httpAgent] - An HTTP agent used to manage HTTP(s) connections.
     * @param {Core.Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
     * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
     * @param {Core.Headers} opts.defaultHeaders - Default headers to include with every request to the API.
     * @param {Core.DefaultQuery} opts.defaultQuery - Default query parameters to include with every request to the API.
     * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
     */
    constructor({ baseURL = readEnv('OPENAI_BASE_URL'), apiKey = readEnv('OPENAI_API_KEY'), organization = readEnv('OPENAI_ORG_ID') ?? null, project = readEnv('OPENAI_PROJECT_ID') ?? null, ...opts } = {}) {
        if (apiKey === undefined) {
            throw new OpenAIError("The OPENAI_API_KEY environment variable is missing or empty; either provide it, or instantiate the OpenAI client with an apiKey option, like new OpenAI({ apiKey: 'My API Key' }).");
        }
        const options = {
            apiKey,
            organization,
            project,
            ...opts,
            baseURL: baseURL || `https://api.openai.com/v1`,
        };
        if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
            throw new OpenAIError("It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew OpenAI({ apiKey, dangerouslyAllowBrowser: true });\n\nhttps://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety\n");
        }
        super({
            baseURL: options.baseURL,
            timeout: options.timeout ?? 600000 /* 10 minutes */,
            httpAgent: options.httpAgent,
            maxRetries: options.maxRetries,
            fetch: options.fetch,
        });
        this.completions = new Completions(this);
        this.chat = new Chat$1(this);
        this.embeddings = new Embeddings(this);
        this.files = new Files(this);
        this.images = new Images(this);
        this.audio = new Audio(this);
        this.moderations = new Moderations(this);
        this.models = new Models(this);
        this.fineTuning = new FineTuning(this);
        this.beta = new Beta(this);
        this.batches = new Batches(this);
        this.uploads = new Uploads(this);
        this._options = options;
        this.apiKey = apiKey;
        this.organization = organization;
        this.project = project;
    }
    defaultQuery() {
        return this._options.defaultQuery;
    }
    defaultHeaders(opts) {
        return {
            ...super.defaultHeaders(opts),
            'OpenAI-Organization': this.organization,
            'OpenAI-Project': this.project,
            ...this._options.defaultHeaders,
        };
    }
    authHeaders(opts) {
        return { Authorization: `Bearer ${this.apiKey}` };
    }
    stringifyQuery(query) {
        return stringify(query, { arrayFormat: 'brackets' });
    }
}
_a = OpenAI;
OpenAI.OpenAI = _a;
OpenAI.DEFAULT_TIMEOUT = 600000; // 10 minutes
OpenAI.OpenAIError = OpenAIError;
OpenAI.APIError = APIError;
OpenAI.APIConnectionError = APIConnectionError;
OpenAI.APIConnectionTimeoutError = APIConnectionTimeoutError;
OpenAI.APIUserAbortError = APIUserAbortError;
OpenAI.NotFoundError = NotFoundError;
OpenAI.ConflictError = ConflictError;
OpenAI.RateLimitError = RateLimitError;
OpenAI.BadRequestError = BadRequestError;
OpenAI.AuthenticationError = AuthenticationError;
OpenAI.InternalServerError = InternalServerError;
OpenAI.PermissionDeniedError = PermissionDeniedError;
OpenAI.UnprocessableEntityError = UnprocessableEntityError;
OpenAI.toFile = toFile;
OpenAI.fileFromPath = fileFromPath;
OpenAI.Completions = Completions;
OpenAI.Chat = Chat$1;
OpenAI.ChatCompletionsPage = ChatCompletionsPage;
OpenAI.Embeddings = Embeddings;
OpenAI.Files = Files;
OpenAI.FileObjectsPage = FileObjectsPage;
OpenAI.Images = Images;
OpenAI.Audio = Audio;
OpenAI.Moderations = Moderations;
OpenAI.Models = Models;
OpenAI.ModelsPage = ModelsPage;
OpenAI.FineTuning = FineTuning;
OpenAI.Beta = Beta;
OpenAI.Batches = Batches;
OpenAI.BatchesPage = BatchesPage;
OpenAI.Uploads = Uploads;

class OpenaiProvider {
    constructor(param, defaultModel, options) {
        this.defaultModel = 'gpt-4o';
        if (defaultModel) {
            this.defaultModel = defaultModel;
        }
        if (typeof window !== 'undefined' &&
            typeof document !== 'undefined' &&
            (typeof param == 'string' || param.apiKey)) {
            console.warn(`
        ⚠️ Security Warning:
        DO NOT use API Keys in browser/frontend code!
        This will expose your credentials and may lead to unauthorized usage.
        
        Best Practices: Configure backend API proxy request through baseURL and request headers.

        Please refer to the link: https://eko.fellou.ai/docs/getting-started/configuration#web-environment
      `);
        }
        if (typeof param == 'string') {
            this.client = new OpenAI({
                apiKey: param,
                dangerouslyAllowBrowser: true,
                ...options,
            });
        }
        else if (param.chat && param.chat.completions) {
            this.client = param;
        }
        else {
            let options = param;
            options.dangerouslyAllowBrowser = true;
            this.client = new OpenAI(options);
        }
    }
    buildParams(messages, params, stream) {
        let tools = undefined;
        if (params.tools && params.tools.length > 0) {
            tools = [];
            for (let i = 0; i < params.tools.length; i++) {
                let tool = params.tools[i];
                tools.push({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.input_schema,
                    },
                });
            }
        }
        let tool_choice = undefined;
        if (params.toolChoice) {
            if (params.toolChoice.type == 'auto') {
                tool_choice = 'auto';
            }
            else if (params.toolChoice.type == 'tool') {
                if (params.toolChoice.name) {
                    tool_choice = {
                        type: 'function',
                        function: { name: params.toolChoice.name },
                    };
                }
                else {
                    tool_choice = 'required';
                }
            }
        }
        let _messages = [];
        for (let i = 0; i < messages.length; i++) {
            let message = messages[i];
            if (message.role == 'assistant' && typeof message.content !== 'string') {
                let _content = undefined;
                let _tool_calls = undefined;
                for (let j = 0; j < message.content.length; j++) {
                    let content = message.content[j];
                    if (content.type == 'text') {
                        if (!_content) {
                            _content = [];
                        }
                        _content.push(content);
                    }
                    else if (content.type == 'tool_use') {
                        if (!_tool_calls) {
                            _tool_calls = [];
                        }
                        _tool_calls.push({
                            id: content.id,
                            type: 'function',
                            function: {
                                name: content.name,
                                arguments: typeof content.input == 'string' ? content.input : JSON.stringify(content.input),
                            },
                        });
                    }
                }
                _messages.push({
                    role: 'assistant',
                    content: _content,
                    tool_calls: _tool_calls,
                });
            }
            else if (message.role == 'user' && typeof message.content !== 'string') {
                for (let j = 0; j < message.content.length; j++) {
                    let content = message.content[j];
                    if (content.type == 'text') {
                        _messages.push({
                            role: 'user',
                            content: content.text,
                        });
                    }
                    else if (content.type == 'image') {
                        _messages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${content.source.media_type};base64,${content.source.data}`,
                                    },
                                },
                            ],
                        });
                    }
                    else if (content.type == 'tool_result') {
                        let _content = [];
                        if (content.content == 'string') {
                            _content.push({ type: 'text', text: content.content });
                        }
                        else {
                            for (let k = 0; k < content.content.length; k++) {
                                let item = content.content[k];
                                if (item.type == 'text') {
                                    _content.push({ ...item });
                                }
                                else if (item.type == 'image') {
                                    _content.push({
                                        type: 'image_url',
                                        image_url: {
                                            url: `data:${item.source.media_type};base64,${item.source.data}`,
                                        },
                                    });
                                }
                            }
                        }
                        let hasImage = _content.filter((s) => s.type == 'image_url').length > 0;
                        if (hasImage) {
                            // OpenAI does not support images returned by the tool.
                            _messages.push({
                                role: 'tool',
                                content: 'ok',
                                tool_call_id: content.tool_call_id || content.tool_use_id,
                            });
                            _messages.push({
                                role: 'user',
                                content: _content,
                            });
                        }
                        else {
                            _messages.push({
                                role: 'tool',
                                content: _content,
                                tool_call_id: content.tool_call_id || content.tool_use_id,
                            });
                        }
                    }
                }
            }
            else {
                _messages.push(message);
            }
        }
        return {
            stream: stream,
            model: params.model || this.defaultModel,
            max_tokens: params.maxTokens || 4096,
            temperature: params.temperature,
            messages: _messages,
            tools: tools,
            tool_choice: tool_choice,
        };
    }
    async generateText(messages, params) {
        const response = await this.client.chat.completions.create(this.buildParams(messages, params, false));
        let textContent = null;
        let toolCalls = [];
        let stop_reason = null;
        for (let i = 0; i < response.choices.length; i++) {
            let choice = response.choices[i];
            let message = choice.message;
            if (message.content) {
                if (textContent == null) {
                    textContent = '';
                }
                textContent += message.content;
            }
            if (message.tool_calls) {
                for (let j = 0; j < message.tool_calls.length; j++) {
                    let tool_call = message.tool_calls[j];
                    toolCalls.push({
                        id: tool_call.id,
                        name: tool_call.function.name,
                        input: JSON.parse(tool_call.function.arguments),
                    });
                }
            }
            if (choice.finish_reason) {
                stop_reason = choice.finish_reason;
            }
        }
        let content = [];
        if (textContent) {
            content.push({
                type: 'text',
                text: textContent,
            });
        }
        if (toolCalls && toolCalls.length > 0) {
            for (let i = 0; i < toolCalls.length; i++) {
                let toolCall = toolCalls[i];
                content.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.name,
                    input: toolCall.input,
                });
            }
        }
        return {
            textContent,
            content,
            toolCalls,
            stop_reason,
        };
    }
    async generateStream(messages, params, handler) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const stream = await this.client.chat.completions.create(this.buildParams(messages, params, true));
        (_a = handler.onStart) === null || _a === void 0 ? void 0 : _a.call(handler);
        let textContent = null;
        let toolCalls = [];
        let stop_reason = null;
        let currentToolUse = null;
        try {
            for await (const chunk of stream) {
                for (let i = 0; i < chunk.choices.length; i++) {
                    let choice = chunk.choices[i];
                    if (choice.delta) {
                        if (choice.delta.content) {
                            if (textContent == null) {
                                textContent = '';
                            }
                            textContent += choice.delta.content;
                            (_b = handler.onContent) === null || _b === void 0 ? void 0 : _b.call(handler, choice.delta.content);
                        }
                        else if (choice.delta.tool_calls && choice.delta.tool_calls.length > 0) {
                            let tool_calls = choice.delta.tool_calls[0];
                            if (!currentToolUse) {
                                currentToolUse = {
                                    id: tool_calls.id || '',
                                    name: ((_c = tool_calls.function) === null || _c === void 0 ? void 0 : _c.name) || '',
                                    accumulatedJson: ((_d = tool_calls.function) === null || _d === void 0 ? void 0 : _d.arguments) || '',
                                };
                            }
                            else {
                                if (tool_calls.id) {
                                    currentToolUse.id = tool_calls.id;
                                }
                                if ((_e = tool_calls.function) === null || _e === void 0 ? void 0 : _e.name) {
                                    currentToolUse.name = (_f = tool_calls.function) === null || _f === void 0 ? void 0 : _f.name;
                                }
                                currentToolUse.accumulatedJson += ((_g = tool_calls.function) === null || _g === void 0 ? void 0 : _g.arguments) || '';
                            }
                        }
                    }
                    if (choice.finish_reason) {
                        stop_reason = choice.finish_reason;
                        if (currentToolUse) {
                            const toolCall = {
                                id: currentToolUse.id,
                                name: currentToolUse.name,
                                input: JSON.parse(currentToolUse.accumulatedJson),
                            };
                            toolCalls.push(toolCall);
                            (_h = handler.onToolUse) === null || _h === void 0 ? void 0 : _h.call(handler, toolCall);
                            currentToolUse = null;
                        }
                    }
                }
            }
            let content = [];
            if (textContent) {
                content.push({
                    type: 'text',
                    text: textContent,
                });
            }
            if (toolCalls && toolCalls.length > 0) {
                for (let i = 0; i < toolCalls.length; i++) {
                    let toolCall = toolCalls[i];
                    content.push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.name,
                        input: toolCall.input,
                    });
                }
            }
            (_j = handler.onComplete) === null || _j === void 0 ? void 0 : _j.call(handler, {
                textContent: textContent,
                content: content,
                toolCalls: toolCalls,
                stop_reason: stop_reason,
            });
        }
        catch (error) {
            (_k = handler.onError) === null || _k === void 0 ? void 0 : _k.call(handler, error);
        }
    }
}

const workflowSchema = {
    type: "object",
    required: ["id", "name", "nodes"],
    properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        nodes: {
            type: "array",
            items: {
                type: "object",
                required: ["id", "type", "action"],
                properties: {
                    id: { type: "string" },
                    type: {
                        type: "string",
                        enum: ["action"], // only action nodes for now; reserved for future types like condition, loop, etc.
                    },
                    dependencies: {
                        type: "array",
                        items: { type: "string" },
                    },
                    output: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            description: { type: "string" },
                        },
                    },
                    action: {
                        type: "object",
                        required: ["type", "name", "description"],
                        properties: {
                            type: {
                                type: "string",
                                // enum: ["prompt", "script", "hybrid"],
                                enum: ["prompt"],
                            },
                            name: { type: "string" },
                            description: { type: "string" },
                            params: { type: "object" },
                            tools: {
                                type: "array",
                                items: { type: "string" }, // enum values from tool registry will be dynamically populated
                            },
                        },
                    },
                },
            },
        },
        variables: {
            type: "object",
            additionalProperties: true,
        },
    },
};

// src/core/tool-registry.ts
class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    unregisterTool(toolName) {
        return this.tools.delete(toolName);
    }
    getTool(toolName) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool with name ${toolName} not found`);
        }
        return tool;
    }
    hasTools(toolNames) {
        return toolNames.every(name => this.tools.has(name));
    }
    getAllTools() {
        return Array.from(this.tools.values());
    }
    getToolDefinitions() {
        return this.getAllTools().map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
        }));
    }
    getToolEnum() {
        return Array.from(this.tools.keys());
    }
    // Gets workflow schema with current tools
    getWorkflowSchema() {
        const schema = JSON.parse(JSON.stringify(workflowSchema)); // Deep clone
        // Update the tools property in action schema to use current tool enum
        const actionProperties = schema.properties.nodes.items.properties.action.properties;
        actionProperties.tools = {
            type: 'array',
            items: {
                type: 'string',
                enum: this.getToolEnum()
            },
        };
        return schema;
    }
}

/**
 * Eko core
 */
class Eko {
    constructor(llmConfig, ekoConfig) {
        this.toolRegistry = new ToolRegistry();
        this.workflowGeneratorMap = new Map();
        if (typeof llmConfig == 'string') {
            this.llmProvider = new ClaudeProvider(llmConfig);
        }
        else if ('llm' in llmConfig) {
            if (llmConfig.llm == 'claude') {
                let claudeConfig = llmConfig;
                this.llmProvider = new ClaudeProvider(claudeConfig.apiKey, claudeConfig.modelName, claudeConfig.options);
            }
            else if (llmConfig.llm == 'openai') {
                let openaiConfig = llmConfig;
                this.llmProvider = new OpenaiProvider(openaiConfig.apiKey, openaiConfig.modelName, openaiConfig.options);
            }
            else {
                let msg = 'Unknown parameter: llm > ' + llmConfig['llm'];
                console.error(msg);
                throw new Error(msg);
            }
        }
        else {
            this.llmProvider = llmConfig;
        }
        if (ekoConfig) {
            this.ekoConfig = ekoConfig;
        }
        else {
            console.warn("`ekoConfig` is missing when construct `Eko` instance, default to `{}`");
            this.ekoConfig = {};
        }
        this.registerTools();
    }
    registerTools() {
        let tools = Array.from(Eko.tools.entries()).map(([_key, tool]) => tool);
        // filter human tools by callbacks
        const callback = this.ekoConfig.callback;
        if (callback) {
            const hooks = callback.hooks;
            // these tools could not work without corresponding hook
            const tool2isHookExists = {
                "human_input_text": Boolean(hooks.onHumanInputText),
                "human_input_single_choice": Boolean(hooks.onHumanInputSingleChoice),
                "human_input_multiple_choice": Boolean(hooks.onHumanInputMultipleChoice),
                "human_operate": Boolean(hooks.onHumanOperate),
            };
            tools = tools.filter(tool => {
                if (tool.name in tool2isHookExists) {
                    let isHookExists = tool2isHookExists[tool.name];
                    return isHookExists;
                }
                else {
                    return true;
                }
            });
        }
        else {
            console.warn("`ekoConfig.callback` is missing when construct `Eko` instance.");
        }
        tools.forEach(tool => this.toolRegistry.registerTool(tool));
    }
    async generate(prompt, param) {
        let toolRegistry = this.toolRegistry;
        if (param && param.tools && param.tools.length > 0) {
            toolRegistry = new ToolRegistry();
            for (let i = 0; i < param.tools.length; i++) {
                let tool = param.tools[i];
                if (typeof tool == 'string') {
                    toolRegistry.registerTool(this.getTool(tool));
                }
                else {
                    toolRegistry.registerTool(tool);
                }
            }
        }
        const generator = new WorkflowGenerator(this.llmProvider, toolRegistry);
        const workflow = await generator.generateWorkflow(prompt, this.ekoConfig);
        this.workflowGeneratorMap.set(workflow, generator);
        return workflow;
    }
    async execute(workflow) {
        // Inject LLM provider at workflow level
        workflow.llmProvider = this.llmProvider;
        // Process each node's action
        for (const node of workflow.nodes) {
            if (node.action.type === 'prompt') {
                // Inject LLM provider
                node.action.llmProvider = this.llmProvider;
                // Resolve tools
                node.action.tools = node.action.tools.map(tool => {
                    if (typeof tool === 'string') {
                        return this.toolRegistry.getTool(tool);
                    }
                    return tool;
                });
            }
        }
        return await workflow.execute(this.ekoConfig.callback);
    }
    async cancel(workflow) {
        return await workflow.cancel();
    }
    async modify(workflow, prompt) {
        const generator = this.workflowGeneratorMap.get(workflow);
        workflow = await generator.modifyWorkflow(prompt, this.ekoConfig);
        this.workflowGeneratorMap.set(workflow, generator);
        return workflow;
    }
    getTool(toolName) {
        let tool;
        if (this.toolRegistry.hasTools([toolName])) {
            tool = this.toolRegistry.getTool(toolName);
        }
        else if (Eko.tools.has(toolName)) {
            tool = Eko.tools.get(toolName);
        }
        else {
            throw new Error(`Tool with name ${toolName} not found`);
        }
        return tool;
    }
    async callTool(tool, input, callback) {
        if (typeof tool === 'string') {
            tool = this.getTool(tool);
        }
        let context = {
            llmProvider: this.llmProvider,
            ekoConfig: this.ekoConfig,
            variables: new Map(),
            tools: new Map(),
            callback,
        };
        let result = await tool.execute(context, input);
        if (tool.destroy) {
            tool.destroy(context);
        }
        return result;
    }
    registerTool(tool) {
        this.toolRegistry.registerTool(tool);
    }
    unregisterTool(toolName) {
        this.toolRegistry.unregisterTool(toolName);
    }
}
Eko.tools = new Map();

class WorkflowParser {
    /**
     * Parse JSON string into runtime Workflow object
     * @throws {Error} if JSON is invalid or schema validation fails
     */
    static parse(json, ekoConfig) {
        let parsed;
        try {
            parsed = JSON.parse(json);
        }
        catch (e) {
            throw new Error(`Invalid JSON: ${e.message}`);
        }
        const validationResult = this.validate(parsed);
        if (!validationResult.valid) {
            throw new Error(`Invalid workflow: ${validationResult.errors.map((e) => e.message).join(', ')}`);
        }
        return this.toRuntime(parsed, ekoConfig);
    }
    /**
     * Convert runtime Workflow object to JSON string
     */
    static serialize(workflow) {
        const json = this.fromRuntime(workflow);
        return JSON.stringify(json, null, 2);
    }
    /**
     * Validate workflow JSON structure against schema
     */
    static validate(json) {
        const errors = [];
        // Basic structure validation
        if (!json || typeof json !== 'object') {
            errors.push({
                type: 'schema',
                message: 'Workflow must be an object',
            });
            return { valid: false, errors };
        }
        const workflow = json;
        // Required fields validation
        const requiredFields = ['id', 'name', 'nodes'];
        for (const field of requiredFields) {
            if (!(field in workflow)) {
                errors.push({
                    type: 'schema',
                    message: `Missing required field: ${field}`,
                    path: `/${field}`,
                });
            }
        }
        // Nodes validation
        if (!Array.isArray(workflow.nodes)) {
            errors.push({
                type: 'type',
                message: 'Nodes must be an array',
                path: '/nodes',
            });
        }
        else {
            const nodeIds = new Set();
            // Validate each node
            workflow.nodes.forEach((node, index) => {
                if (!node.id) {
                    errors.push({
                        type: 'schema',
                        message: `Node at index ${index} missing id`,
                        path: `/nodes/${index}/id`,
                    });
                }
                else {
                    if (nodeIds.has(node.id)) {
                        errors.push({
                            type: 'reference',
                            message: `Duplicate node id: ${node.id}`,
                            path: `/nodes/${index}/id`,
                        });
                    }
                    nodeIds.add(node.id);
                }
                // Validate dependencies
                if (node.dependencies) {
                    if (!Array.isArray(node.dependencies)) {
                        errors.push({
                            type: 'type',
                            message: `Dependencies must be an array for node ${node.id}`,
                            path: `/nodes/${index}/dependencies`,
                        });
                    }
                    else {
                        node.dependencies.forEach((depId) => {
                            if (typeof depId !== 'string') {
                                errors.push({
                                    type: 'type',
                                    message: `Dependency id must be a string in node ${node.id}`,
                                    path: `/nodes/${index}/dependencies`,
                                });
                            }
                        });
                    }
                }
                // Validate action
                if (!node.action) {
                    errors.push({
                        type: 'schema',
                        message: `Node ${node.id} missing action`,
                        path: `/nodes/${index}/action`,
                    });
                }
                else {
                    if (!['prompt', 'script', 'hybrid'].includes(node.action.type)) {
                        errors.push({
                            type: 'type',
                            message: `Invalid action type for node ${node.id}`,
                            path: `/nodes/${index}/action/type`,
                        });
                    }
                }
            });
            // Validate dependency references
            workflow.nodes.forEach((node) => {
                if (node.dependencies) {
                    node.dependencies.forEach((depId) => {
                        if (!nodeIds.has(depId)) {
                            errors.push({
                                type: 'reference',
                                message: `Node ${node.id} references non-existent dependency: ${depId}`,
                                path: `/nodes/${workflow.nodes.findIndex((n) => n.id === node.id)}/dependencies`,
                            });
                        }
                    });
                }
            });
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    static toRuntime(json, ekoConfig) {
        const variables = new Map(Object.entries(json.variables || {}));
        const workflow = new WorkflowImpl(json.id, json.name, ekoConfig, json.description, [], variables, undefined, {
            logLevel: 'info',
            includeTimestamp: true,
        });
        // Convert nodes
        json.nodes.forEach((nodeJson) => {
            const action = ActionImpl.createPromptAction(nodeJson.action.name, nodeJson.action.description, 
            // Pass tool names as strings, they'll be resolved at execution time
            nodeJson.action.tools || [], undefined, // LLM provider will be injected at execution time
            { maxTokens: 1000 });
            const node = {
                id: nodeJson.id,
                name: nodeJson.name || nodeJson.id,
                description: nodeJson.description,
                dependencies: nodeJson.dependencies || [],
                input: { items: [] },
                output: nodeJson.output || {
                    name: `${nodeJson.name || nodeJson.id}_output`,
                    description: `Output of node ${nodeJson.name || nodeJson.id}`,
                    value: null,
                },
                action: action,
            };
            workflow.addNode(node);
        });
        return workflow;
    }
    /**
     * Convert runtime Workflow object to JSON structure
     */
    static fromRuntime(workflow) {
        return {
            version: '1.0',
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            nodes: workflow.nodes.map((node) => ({
                id: node.id,
                name: node.name,
                description: node.description,
                dependencies: node.dependencies,
                output: node.output,
                action: {
                    type: node.action.type,
                    name: node.action.name,
                    description: node.action.description,
                    tools: node.action.tools
                        .map((tool) => (typeof tool === 'string' ? tool : tool.name))
                        .filter((tool) => tool !== 'write_context'),
                },
            })),
            variables: Object.fromEntries(workflow.variables),
        };
    }
}

exports.ClaudeProvider = ClaudeProvider;
exports.Eko = Eko;
exports.ExecutionLogger = ExecutionLogger;
exports.OpenaiProvider = OpenaiProvider;
exports.ToolRegistry = ToolRegistry;
exports.WorkflowGenerator = WorkflowGenerator;
exports.WorkflowParser = WorkflowParser;
exports.default = Eko;
