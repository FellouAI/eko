'use strict';

var os = require('os');
var path = require('path');
var util = require('util');

const prettyLogStyles = {
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29],
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    blackBright: [90, 39],
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39],
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    bgBlackBright: [100, 49],
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49],
};

function formatTemplate(settings, template, values, hideUnsetPlaceholder = false) {
    const templateString = String(template);
    const ansiColorWrap = (placeholderValue, code) => `\u001b[${code[0]}m${placeholderValue}\u001b[${code[1]}m`;
    const styleWrap = (value, style) => {
        if (style != null && typeof style === "string") {
            return ansiColorWrap(value, prettyLogStyles[style]);
        }
        else if (style != null && Array.isArray(style)) {
            return style.reduce((prevValue, thisStyle) => styleWrap(prevValue, thisStyle), value);
        }
        else {
            if (style != null && style[value.trim()] != null) {
                return styleWrap(value, style[value.trim()]);
            }
            else if (style != null && style["*"] != null) {
                return styleWrap(value, style["*"]);
            }
            else {
                return value;
            }
        }
    };
    const defaultStyle = null;
    return templateString.replace(/{{(.+?)}}/g, (_, placeholder) => {
        const value = values[placeholder] != null ? String(values[placeholder]) : hideUnsetPlaceholder ? "" : _;
        return settings.stylePrettyLogs
            ? styleWrap(value, settings?.prettyLogStyles?.[placeholder] ?? defaultStyle) + ansiColorWrap("", prettyLogStyles.reset)
            : value;
    });
}

function formatNumberAddZeros(value, digits = 2, addNumber = 0) {
    if (value != null && isNaN(value)) {
        return "";
    }
    value = value != null ? value + addNumber : value;
    return digits === 2
        ? value == null
            ? "--"
            : value < 10
                ? "0" + value
                : value.toString()
        : value == null
            ? "---"
            : value < 10
                ? "00" + value
                : value < 100
                    ? "0" + value
                    : value.toString();
}

function urlToObject(url) {
    return {
        href: url.href,
        protocol: url.protocol,
        username: url.username,
        password: url.password,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        searchParams: [...url.searchParams].map(([key, value]) => ({ key, value })),
        hash: url.hash,
        origin: url.origin,
    };
}

var Runtime = {
    getCallerStackFrame,
    getErrorTrace,
    getMeta,
    transportJSON,
    transportFormatted: transportFormatted$1,
    isBuffer,
    isError,
    prettyFormatLogObj,
    prettyFormatErrorObj,
};
const meta = {
    runtime: "Nodejs",
    runtimeVersion: process?.version,
    hostname: os.hostname ? os.hostname() : undefined,
};
function getMeta(logLevelId, logLevelName, stackDepthLevel, hideLogPositionForPerformance, name, parentNames) {
    return Object.assign({}, meta, {
        name,
        parentNames,
        date: new Date(),
        logLevelId,
        logLevelName,
        path: !hideLogPositionForPerformance ? getCallerStackFrame(stackDepthLevel) : undefined,
    });
}
function getCallerStackFrame(stackDepthLevel, error = Error()) {
    return stackLineToStackFrame(error?.stack?.split("\n")?.filter((thisLine) => thisLine.includes("    at "))?.[stackDepthLevel]);
}
function getErrorTrace(error) {
    return error?.stack?.split("\n")?.reduce((result, line) => {
        if (line.includes("    at ")) {
            result.push(stackLineToStackFrame(line));
        }
        return result;
    }, []);
}
function stackLineToStackFrame(line) {
    const pathResult = {
        fullFilePath: undefined,
        fileName: undefined,
        fileNameWithLine: undefined,
        fileColumn: undefined,
        fileLine: undefined,
        filePath: undefined,
        filePathWithLine: undefined,
        method: undefined,
    };
    if (line != null && line.includes("    at ")) {
        line = line.replace(/^\s+at\s+/gm, "");
        const errorStackLine = line.split(" (");
        const fullFilePath = line?.slice(-1) === ")" ? line?.match(/\(([^)]+)\)/)?.[1] : line;
        const pathArray = fullFilePath?.includes(":") ? fullFilePath?.replace("file://", "")?.replace(process.cwd(), "")?.split(":") : undefined;
        const fileColumn = pathArray?.pop();
        const fileLine = pathArray?.pop();
        const filePath = pathArray?.pop();
        const filePathWithLine = path.normalize(`${filePath}:${fileLine}`);
        const fileName = filePath?.split("/")?.pop();
        const fileNameWithLine = `${fileName}:${fileLine}`;
        if (filePath != null && filePath.length > 0) {
            pathResult.fullFilePath = fullFilePath;
            pathResult.fileName = fileName;
            pathResult.fileNameWithLine = fileNameWithLine;
            pathResult.fileColumn = fileColumn;
            pathResult.fileLine = fileLine;
            pathResult.filePath = filePath;
            pathResult.filePathWithLine = filePathWithLine;
            pathResult.method = errorStackLine?.[1] != null ? errorStackLine?.[0] : undefined;
        }
    }
    return pathResult;
}
function isError(e) {
    return util.types?.isNativeError != null ? util.types.isNativeError(e) : e instanceof Error;
}
function prettyFormatLogObj(maskedArgs, settings) {
    return maskedArgs.reduce((result, arg) => {
        isError(arg) ? result.errors.push(prettyFormatErrorObj(arg, settings)) : result.args.push(arg);
        return result;
    }, { args: [], errors: [] });
}
function prettyFormatErrorObj(error, settings) {
    const errorStackStr = getErrorTrace(error).map((stackFrame) => {
        return formatTemplate(settings, settings.prettyErrorStackTemplate, { ...stackFrame }, true);
    });
    const placeholderValuesError = {
        errorName: ` ${error.name} `,
        errorMessage: Object.getOwnPropertyNames(error)
            .reduce((result, key) => {
            if (key !== "stack") {
                result.push(error[key]);
            }
            return result;
        }, [])
            .join(", "),
        errorStack: errorStackStr.join("\n"),
    };
    return formatTemplate(settings, settings.prettyErrorTemplate, placeholderValuesError);
}
function transportFormatted$1(logMetaMarkup, logArgs, logErrors, settings) {
    const logErrorsStr = (logErrors.length > 0 && logArgs.length > 0 ? "\n" : "") + logErrors.join("\n");
    settings.prettyInspectOptions.colors = settings.stylePrettyLogs;
    console.log(logMetaMarkup + util.formatWithOptions(settings.prettyInspectOptions, ...logArgs) + logErrorsStr);
}
function transportJSON(json) {
    console.log(jsonStringifyRecursive(json));
    function jsonStringifyRecursive(obj) {
        const cache = new Set();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (cache.has(value)) {
                    return "[Circular]";
                }
                cache.add(value);
            }
            if (typeof value === "bigint") {
                return `${value}`;
            }
            if (typeof value === "undefined") {
                return "[undefined]";
            }
            return value;
        });
    }
}
function isBuffer(arg) {
    return Buffer.isBuffer(arg);
}

class BaseLogger {
    constructor(settings, logObj, stackDepthLevel = 4) {
        this.logObj = logObj;
        this.stackDepthLevel = stackDepthLevel;
        this.runtime = Runtime;
        this.settings = {
            type: settings?.type ?? "pretty",
            name: settings?.name,
            parentNames: settings?.parentNames,
            minLevel: settings?.minLevel ?? 0,
            argumentsArrayName: settings?.argumentsArrayName,
            hideLogPositionForProduction: settings?.hideLogPositionForProduction ?? false,
            prettyLogTemplate: settings?.prettyLogTemplate ??
                "{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}\t{{logLevelName}}\t{{filePathWithLine}}{{nameWithDelimiterPrefix}}\t",
            prettyErrorTemplate: settings?.prettyErrorTemplate ?? "\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}",
            prettyErrorStackTemplate: settings?.prettyErrorStackTemplate ?? "  • {{fileName}}\t{{method}}\n\t{{filePathWithLine}}",
            prettyErrorParentNamesSeparator: settings?.prettyErrorParentNamesSeparator ?? ":",
            prettyErrorLoggerNameDelimiter: settings?.prettyErrorLoggerNameDelimiter ?? "\t",
            stylePrettyLogs: settings?.stylePrettyLogs ?? true,
            prettyLogTimeZone: settings?.prettyLogTimeZone ?? "UTC",
            prettyLogStyles: settings?.prettyLogStyles ?? {
                logLevelName: {
                    "*": ["bold", "black", "bgWhiteBright", "dim"],
                    SILLY: ["bold", "white"],
                    TRACE: ["bold", "whiteBright"],
                    DEBUG: ["bold", "green"],
                    INFO: ["bold", "blue"],
                    WARN: ["bold", "yellow"],
                    ERROR: ["bold", "red"],
                    FATAL: ["bold", "redBright"],
                },
                dateIsoStr: "white",
                filePathWithLine: "white",
                name: ["white", "bold"],
                nameWithDelimiterPrefix: ["white", "bold"],
                nameWithDelimiterSuffix: ["white", "bold"],
                errorName: ["bold", "bgRedBright", "whiteBright"],
                fileName: ["yellow"],
                fileNameWithLine: "white",
            },
            prettyInspectOptions: settings?.prettyInspectOptions ?? {
                colors: true,
                compact: false,
                depth: Infinity,
            },
            metaProperty: settings?.metaProperty ?? "_meta",
            maskPlaceholder: settings?.maskPlaceholder ?? "[***]",
            maskValuesOfKeys: settings?.maskValuesOfKeys ?? ["password"],
            maskValuesOfKeysCaseInsensitive: settings?.maskValuesOfKeysCaseInsensitive ?? false,
            maskValuesRegEx: settings?.maskValuesRegEx,
            prefix: [...(settings?.prefix ?? [])],
            attachedTransports: [...(settings?.attachedTransports ?? [])],
            overwrite: {
                mask: settings?.overwrite?.mask,
                toLogObj: settings?.overwrite?.toLogObj,
                addMeta: settings?.overwrite?.addMeta,
                addPlaceholders: settings?.overwrite?.addPlaceholders,
                formatMeta: settings?.overwrite?.formatMeta,
                formatLogObj: settings?.overwrite?.formatLogObj,
                transportFormatted: settings?.overwrite?.transportFormatted,
                transportJSON: settings?.overwrite?.transportJSON,
            },
        };
    }
    log(logLevelId, logLevelName, ...args) {
        if (logLevelId < this.settings.minLevel) {
            return;
        }
        const logArgs = [...this.settings.prefix, ...args];
        const maskedArgs = this.settings.overwrite?.mask != null
            ? this.settings.overwrite?.mask(logArgs)
            : this.settings.maskValuesOfKeys != null && this.settings.maskValuesOfKeys.length > 0
                ? this._mask(logArgs)
                : logArgs;
        const thisLogObj = this.logObj != null ? this._recursiveCloneAndExecuteFunctions(this.logObj) : undefined;
        const logObj = this.settings.overwrite?.toLogObj != null ? this.settings.overwrite?.toLogObj(maskedArgs, thisLogObj) : this._toLogObj(maskedArgs, thisLogObj);
        const logObjWithMeta = this.settings.overwrite?.addMeta != null
            ? this.settings.overwrite?.addMeta(logObj, logLevelId, logLevelName)
            : this._addMetaToLogObj(logObj, logLevelId, logLevelName);
        let logMetaMarkup;
        let logArgsAndErrorsMarkup = undefined;
        if (this.settings.overwrite?.formatMeta != null) {
            logMetaMarkup = this.settings.overwrite?.formatMeta(logObjWithMeta?.[this.settings.metaProperty]);
        }
        if (this.settings.overwrite?.formatLogObj != null) {
            logArgsAndErrorsMarkup = this.settings.overwrite?.formatLogObj(maskedArgs, this.settings);
        }
        if (this.settings.type === "pretty") {
            logMetaMarkup = logMetaMarkup ?? this._prettyFormatLogObjMeta(logObjWithMeta?.[this.settings.metaProperty]);
            logArgsAndErrorsMarkup = logArgsAndErrorsMarkup ?? this.runtime.prettyFormatLogObj(maskedArgs, this.settings);
        }
        if (logMetaMarkup != null && logArgsAndErrorsMarkup != null) {
            this.settings.overwrite?.transportFormatted != null
                ? this.settings.overwrite?.transportFormatted(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors, this.settings)
                : this.runtime.transportFormatted(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors, this.settings);
        }
        else {
            this.settings.overwrite?.transportJSON != null
                ? this.settings.overwrite?.transportJSON(logObjWithMeta)
                : this.settings.type !== "hidden"
                    ? this.runtime.transportJSON(logObjWithMeta)
                    : undefined;
        }
        if (this.settings.attachedTransports != null && this.settings.attachedTransports.length > 0) {
            this.settings.attachedTransports.forEach((transportLogger) => {
                transportLogger(logObjWithMeta);
            });
        }
        return logObjWithMeta;
    }
    attachTransport(transportLogger) {
        this.settings.attachedTransports.push(transportLogger);
    }
    getSubLogger(settings, logObj) {
        const subLoggerSettings = {
            ...this.settings,
            ...settings,
            parentNames: this.settings?.parentNames != null && this.settings?.name != null
                ? [...this.settings.parentNames, this.settings.name]
                : this.settings?.name != null
                    ? [this.settings.name]
                    : undefined,
            prefix: [...this.settings.prefix, ...(settings?.prefix ?? [])],
        };
        const subLogger = new this.constructor(subLoggerSettings, logObj ?? this.logObj, this.stackDepthLevel);
        return subLogger;
    }
    _mask(args) {
        const maskValuesOfKeys = this.settings.maskValuesOfKeysCaseInsensitive !== true ? this.settings.maskValuesOfKeys : this.settings.maskValuesOfKeys.map((key) => key.toLowerCase());
        return args?.map((arg) => {
            return this._recursiveCloneAndMaskValuesOfKeys(arg, maskValuesOfKeys);
        });
    }
    _recursiveCloneAndMaskValuesOfKeys(source, keys, seen = []) {
        if (seen.includes(source)) {
            return { ...source };
        }
        if (typeof source === "object" && source !== null) {
            seen.push(source);
        }
        if (this.runtime.isError(source) || this.runtime.isBuffer(source)) {
            return source;
        }
        else if (source instanceof Map) {
            return new Map(source);
        }
        else if (source instanceof Set) {
            return new Set(source);
        }
        else if (Array.isArray(source)) {
            return source.map((item) => this._recursiveCloneAndMaskValuesOfKeys(item, keys, seen));
        }
        else if (source instanceof Date) {
            return new Date(source.getTime());
        }
        else if (source instanceof URL) {
            return urlToObject(source);
        }
        else if (source !== null && typeof source === "object") {
            const baseObject = this.runtime.isError(source) ? this._cloneError(source) : Object.create(Object.getPrototypeOf(source));
            return Object.getOwnPropertyNames(source).reduce((o, prop) => {
                o[prop] = keys.includes(this.settings?.maskValuesOfKeysCaseInsensitive !== true ? prop : prop.toLowerCase())
                    ? this.settings.maskPlaceholder
                    : (() => {
                        try {
                            return this._recursiveCloneAndMaskValuesOfKeys(source[prop], keys, seen);
                        }
                        catch (e) {
                            return null;
                        }
                    })();
                return o;
            }, baseObject);
        }
        else {
            if (typeof source === "string") {
                let modifiedSource = source;
                for (const regEx of this.settings?.maskValuesRegEx || []) {
                    modifiedSource = modifiedSource.replace(regEx, this.settings?.maskPlaceholder || "");
                }
                return modifiedSource;
            }
            return source;
        }
    }
    _recursiveCloneAndExecuteFunctions(source, seen = []) {
        if (this.isObjectOrArray(source) && seen.includes(source)) {
            return this.shallowCopy(source);
        }
        if (this.isObjectOrArray(source)) {
            seen.push(source);
        }
        if (Array.isArray(source)) {
            return source.map((item) => this._recursiveCloneAndExecuteFunctions(item, seen));
        }
        else if (source instanceof Date) {
            return new Date(source.getTime());
        }
        else if (this.isObject(source)) {
            return Object.getOwnPropertyNames(source).reduce((o, prop) => {
                const descriptor = Object.getOwnPropertyDescriptor(source, prop);
                if (descriptor) {
                    Object.defineProperty(o, prop, descriptor);
                    const value = source[prop];
                    o[prop] = typeof value === "function" ? value() : this._recursiveCloneAndExecuteFunctions(value, seen);
                }
                return o;
            }, Object.create(Object.getPrototypeOf(source)));
        }
        else {
            return source;
        }
    }
    isObjectOrArray(value) {
        return typeof value === "object" && value !== null;
    }
    isObject(value) {
        return typeof value === "object" && !Array.isArray(value) && value !== null;
    }
    shallowCopy(source) {
        if (Array.isArray(source)) {
            return [...source];
        }
        else {
            return { ...source };
        }
    }
    _toLogObj(args, clonedLogObj = {}) {
        args = args?.map((arg) => (this.runtime.isError(arg) ? this._toErrorObject(arg) : arg));
        if (this.settings.argumentsArrayName == null) {
            if (args.length === 1 && !Array.isArray(args[0]) && this.runtime.isBuffer(args[0]) !== true && !(args[0] instanceof Date)) {
                clonedLogObj = typeof args[0] === "object" && args[0] != null ? { ...args[0], ...clonedLogObj } : { 0: args[0], ...clonedLogObj };
            }
            else {
                clonedLogObj = { ...clonedLogObj, ...args };
            }
        }
        else {
            clonedLogObj = {
                ...clonedLogObj,
                [this.settings.argumentsArrayName]: args,
            };
        }
        return clonedLogObj;
    }
    _cloneError(error) {
        const cloned = new error.constructor();
        Object.getOwnPropertyNames(error).forEach((key) => {
            cloned[key] = error[key];
        });
        return cloned;
    }
    _toErrorObject(error) {
        return {
            nativeError: error,
            name: error.name ?? "Error",
            message: error.message,
            stack: this.runtime.getErrorTrace(error),
        };
    }
    _addMetaToLogObj(logObj, logLevelId, logLevelName) {
        return {
            ...logObj,
            [this.settings.metaProperty]: this.runtime.getMeta(logLevelId, logLevelName, this.stackDepthLevel, this.settings.hideLogPositionForProduction, this.settings.name, this.settings.parentNames),
        };
    }
    _prettyFormatLogObjMeta(logObjMeta) {
        if (logObjMeta == null) {
            return "";
        }
        let template = this.settings.prettyLogTemplate;
        const placeholderValues = {};
        if (template.includes("{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}")) {
            template = template.replace("{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}", "{{dateIsoStr}}");
        }
        else {
            if (this.settings.prettyLogTimeZone === "UTC") {
                placeholderValues["yyyy"] = logObjMeta?.date?.getUTCFullYear() ?? "----";
                placeholderValues["mm"] = formatNumberAddZeros(logObjMeta?.date?.getUTCMonth(), 2, 1);
                placeholderValues["dd"] = formatNumberAddZeros(logObjMeta?.date?.getUTCDate(), 2);
                placeholderValues["hh"] = formatNumberAddZeros(logObjMeta?.date?.getUTCHours(), 2);
                placeholderValues["MM"] = formatNumberAddZeros(logObjMeta?.date?.getUTCMinutes(), 2);
                placeholderValues["ss"] = formatNumberAddZeros(logObjMeta?.date?.getUTCSeconds(), 2);
                placeholderValues["ms"] = formatNumberAddZeros(logObjMeta?.date?.getUTCMilliseconds(), 3);
            }
            else {
                placeholderValues["yyyy"] = logObjMeta?.date?.getFullYear() ?? "----";
                placeholderValues["mm"] = formatNumberAddZeros(logObjMeta?.date?.getMonth(), 2, 1);
                placeholderValues["dd"] = formatNumberAddZeros(logObjMeta?.date?.getDate(), 2);
                placeholderValues["hh"] = formatNumberAddZeros(logObjMeta?.date?.getHours(), 2);
                placeholderValues["MM"] = formatNumberAddZeros(logObjMeta?.date?.getMinutes(), 2);
                placeholderValues["ss"] = formatNumberAddZeros(logObjMeta?.date?.getSeconds(), 2);
                placeholderValues["ms"] = formatNumberAddZeros(logObjMeta?.date?.getMilliseconds(), 3);
            }
        }
        const dateInSettingsTimeZone = this.settings.prettyLogTimeZone === "UTC" ? logObjMeta?.date : new Date(logObjMeta?.date?.getTime() - logObjMeta?.date?.getTimezoneOffset() * 60000);
        placeholderValues["rawIsoStr"] = dateInSettingsTimeZone?.toISOString();
        placeholderValues["dateIsoStr"] = dateInSettingsTimeZone?.toISOString().replace("T", " ").replace("Z", "");
        placeholderValues["logLevelName"] = logObjMeta?.logLevelName;
        placeholderValues["fileNameWithLine"] = logObjMeta?.path?.fileNameWithLine ?? "";
        placeholderValues["filePathWithLine"] = logObjMeta?.path?.filePathWithLine ?? "";
        placeholderValues["fullFilePath"] = logObjMeta?.path?.fullFilePath ?? "";
        let parentNamesString = this.settings.parentNames?.join(this.settings.prettyErrorParentNamesSeparator);
        parentNamesString = parentNamesString != null && logObjMeta?.name != null ? parentNamesString + this.settings.prettyErrorParentNamesSeparator : undefined;
        placeholderValues["name"] = logObjMeta?.name != null || parentNamesString != null ? (parentNamesString ?? "") + logObjMeta?.name ?? "" : "";
        placeholderValues["nameWithDelimiterPrefix"] =
            placeholderValues["name"].length > 0 ? this.settings.prettyErrorLoggerNameDelimiter + placeholderValues["name"] : "";
        placeholderValues["nameWithDelimiterSuffix"] =
            placeholderValues["name"].length > 0 ? placeholderValues["name"] + this.settings.prettyErrorLoggerNameDelimiter : "";
        if (this.settings.overwrite?.addPlaceholders != null) {
            this.settings.overwrite?.addPlaceholders(logObjMeta, placeholderValues);
        }
        return formatTemplate(this.settings, template, placeholderValues);
    }
}

class Logger extends BaseLogger {
    constructor(settings, logObj) {
        const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
        const isBrowserBlinkEngine = isBrowser ? window.chrome !== undefined && window.CSS !== undefined && window.CSS.supports("color", "green") : false;
        const isSafari = isBrowser ? /^((?!chrome|android).)*safari/i.test(navigator.userAgent) : false;
        settings = settings || {};
        settings.stylePrettyLogs = settings.stylePrettyLogs && isBrowser && !isBrowserBlinkEngine ? false : settings.stylePrettyLogs;
        super(settings, logObj, isSafari ? 4 : 5);
    }
    log(logLevelId, logLevelName, ...args) {
        return super.log(logLevelId, logLevelName, ...args);
    }
    silly(...args) {
        return super.log(0, "SILLY", ...args);
    }
    trace(...args) {
        return super.log(1, "TRACE", ...args);
    }
    debug(...args) {
        return super.log(2, "DEBUG", ...args);
    }
    info(...args) {
        return super.log(3, "INFO", ...args);
    }
    warn(...args) {
        return super.log(4, "WARN", ...args);
    }
    error(...args) {
        return super.log(5, "ERROR", ...args);
    }
    fatal(...args) {
        return super.log(6, "FATAL", ...args);
    }
    getSubLogger(settings, logObj) {
        return super.getSubLogger(settings, logObj);
    }
}

function transportFormatted(logMetaMarkup, logArgs, logErrors, settings) {
    const logErrorsStr = (logErrors.length > 0 && logArgs.length > 0 ? "\n" : "") + logErrors.join("\n");
    settings.prettyInspectOptions.colors = settings.stylePrettyLogs;
    console.log(logMetaMarkup, ...logArgs, logErrorsStr);
}
function formatMeta(logObjMeta) {
    if (!logObjMeta) {
        return '';
    }
    const { date, logLevelName } = logObjMeta;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
    const loggerName = logObjMeta.name;
    return `${formattedDate} ${logLevelName} ${loggerName}`;
}
const logger = new Logger({
    name: "ekoLogger",
    overwrite: {
        transportFormatted,
        formatMeta,
    }
});

async function getWindowId(context) {
    let windowId = context.variables.get('windowId');
    if (windowId) {
        try {
            await context.ekoConfig.chromeProxy.windows.get(windowId);
        }
        catch (e) {
            windowId = null;
            context.variables.delete('windowId');
            let tabId = context.variables.get('tabId');
            if (tabId) {
                try {
                    let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
                    windowId = tab.windowId;
                }
                catch (e) {
                    context.variables.delete('tabId');
                }
            }
        }
    }
    if (!windowId) {
        const window = await context.ekoConfig.chromeProxy.windows.getCurrent();
        windowId = window.id;
    }
    // `window.FELLOU_WINDOW_ID` is a feature of Downstream Caller
    if (!windowId) {
        windowId = window.FELLOU_WINDOW_ID;
    }
    if (!windowId) {
        logger.warn("`getWindowId()` returns " + windowId);
    }
    return windowId;
}
async function getTabId(context) {
    logger.debug("debug the getTabId()...");
    let tabId = context.variables.get('tabId');
    if (tabId) {
        try {
            await context.ekoConfig.chromeProxy.tabs.get(tabId);
        }
        catch (e) {
            tabId = null;
            context.variables.delete('tabId');
        }
    }
    if (!tabId) {
        logger.debug("tabId is empty");
        let windowId = await getWindowId(context);
        logger.debug(`windowId=${windowId}`);
        if (windowId) {
            try {
                tabId = await getCurrentTabId(context.ekoConfig.chromeProxy, windowId);
                logger.debug("getCurrentTabId(context.ekoConfig.chromeProxy, windowId) returns " + tabId);
            }
            catch (e) {
                tabId = await getCurrentTabId(context.ekoConfig.chromeProxy);
                logger.debug("getCurrentTabId(context.ekoConfig.chromeProxy, windowId) throws an error");
                logger.debug("getCurrentTabId(context.ekoConfig.chromeProxy) returns " + tabId);
                context.variables.delete('windowId');
            }
        }
        else {
            tabId = await getCurrentTabId(context.ekoConfig.chromeProxy);
            logger.debug("getCurrentTabId(context.ekoConfig.chromeProxy) #2 returns " + tabId);
        }
        if (!tabId) {
            const fellouTabId = window.__FELLOU_TAB_ID__;
            if (tabId) {
                tabId = fellouTabId;
            }
            else {
                throw new Error('Could not find a valid tab');
            }
        }
        context.variables.set('tabId', tabId);
    }
    logger.debug(`debug the getTabId()...returns ${tabId}`);
    return tabId;
}
function getCurrentTabId(chromeProxy, windowId) {
    return new Promise((resolve, reject) => {
        logger.debug("debug the Promise in getCurrentTabId()...");
        logger.debug("get the active tabId on: ", { windowId });
        let queryInfo;
        if (windowId !== undefined) {
            logger.debug(`get the active tab in window (windowId=${windowId})...`);
            queryInfo = { windowId, active: true };
        }
        else {
            logger.debug(`get the active tabId on current window`);
            queryInfo = { active: true, currentWindow: true };
        }
        chrome.tabs.query(queryInfo, (tabs) => {
            if (chromeProxy.runtime.lastError) {
                logger.error(`failed to get: `, chromeProxy.runtime.lastError);
                reject(chromeProxy.runtime.lastError);
                return;
            }
            if (tabs.length > 0) {
                logger.debug(`found the tab, ID=${tabs[0].id}`);
                resolve(tabs[0].id);
            }
            else {
                logger.debug(`cannot find the tab, returns undefined`);
                resolve(undefined);
            }
        });
    });
}
async function open_new_tab(chromeProxy, url, windowId) {
    if (!windowId) {
        const window = await chromeProxy.windows.getCurrent();
        windowId = window.id;
    }
    logger.debug("windowId: " + windowId);
    let tab = await chromeProxy.tabs.create({
        url: url,
        windowId: windowId,
    });
    logger.debug("chromeProxy.tabs.create() done");
    let tabId = tab.id;
    let completedTab = await waitForTabComplete(chromeProxy, tabId);
    logger.debug("waitForTabComplete() done");
    await sleep(200);
    logger.debug("sleep() done");
    return completedTab;
}
async function executeScript(chromeProxy, tabId, func, args) {
    let frameResults = await chromeProxy.scripting.executeScript({
        target: { tabId: tabId },
        func: func,
        args: args,
    });
    return frameResults[0].result;
}
async function waitForTabComplete(chromeProxy, tabId, timeout = 30000) {
    return new Promise(async (resolve, reject) => {
        logger.debug("debug waitForTabComplete()...");
        const time = setTimeout(async () => {
            logger.debug("listener(#1)=", listener);
            chromeProxy.tabs.onUpdated.removeListener(listener);
            logger.debug("tabId(#1)=", tabId);
            let tab = await chromeProxy.tabs.get(tabId);
            logger.debug("tab(#1)=", tab);
            if (tab.status === 'complete') {
                logger.warn('Timeout: waitForTabComplete, but tab is already complete.');
                resolve(tab);
            }
            else {
                logger.warn("Timeout: waitForTabComplete, and tab is not complete");
                resolve(tab);
            }
        }, timeout);
        logger.debug("setTimeout done");
        const listener = async (updatedTabId, changeInfo, tab) => {
            logger.debug("listener start...");
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                logger.debug("listener(#2)=", listener);
                chromeProxy.tabs.onUpdated.removeListener(listener);
                clearTimeout(time);
                resolve(tab);
            }
        };
        logger.debug("tabId(#2)=", tabId);
        let tab = await chromeProxy.tabs.get(tabId);
        logger.debug("tab(#2)=", tab);
        if (tab.status === 'complete') {
            resolve(tab);
            clearTimeout(time);
            return;
        }
        logger.debug("listener(#3)=", listener);
        chromeProxy.tabs.onUpdated.addListener(listener);
        logger.debug("debug waitForTabComplete()...done");
    });
}
async function doesTabExists(chromeProxy, tabId) {
    const tabExists = await new Promise((resolve) => {
        chromeProxy.tabs.get(tabId, (tab) => {
            if (chromeProxy.runtime.lastError) {
                resolve(false);
            }
            else {
                resolve(true);
            }
        });
    });
    return tabExists;
}
async function getPageSize(chromeProxy, tabId) {
    if (!tabId) {
        tabId = await getCurrentTabId(chromeProxy);
    }
    let injectionResult = await chromeProxy.scripting.executeScript({
        target: { tabId: tabId },
        func: () => [
            window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
            window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight,
        ],
    });
    return [injectionResult[0].result[0], injectionResult[0].result[1]];
}
function sleep(time) {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
}
async function injectScript(chromeProxy, tabId, filename) {
    let files = ['eko/script/common.js'];
    if (filename) {
        files.push('eko/script/' + filename);
    }
    await chromeProxy.scripting.executeScript({
        target: { tabId },
        files: files,
    });
}
class MsgEvent {
    constructor() {
        this.eventMap = {};
    }
    addListener(callback, id) {
        if (!id) {
            id = new Date().getTime() + '' + Math.floor(Math.random() * 10000);
        }
        this.eventMap[id] = callback;
        return id;
    }
    removeListener(id) {
        delete this.eventMap[id];
    }
    async publish(msg) {
        let values = Object.values(this.eventMap);
        for (let i = 0; i < values.length; i++) {
            try {
                let result = values[i](msg);
                if (isPromise(result)) {
                    await result;
                }
            }
            catch (e) {
                logger.error(e);
            }
        }
    }
}
/**
 * Counter (Function: Wait for all asynchronous tasks to complete)
 */
class CountDownLatch {
    constructor(count) {
        this.resolve = undefined;
        this.currentCount = count;
    }
    countDown() {
        this.currentCount = this.currentCount - 1;
        if (this.currentCount <= 0) {
            this.resolve && this.resolve();
        }
    }
    await(timeout) {
        const $this = this;
        return new Promise((_resolve, reject) => {
            let resolve = _resolve;
            if (timeout > 0) {
                let timeId = setTimeout(reject, timeout);
                resolve = () => {
                    clearTimeout(timeId);
                    _resolve();
                };
            }
            $this.resolve = resolve;
            if ($this.currentCount <= 0) {
                resolve();
            }
        });
    }
}
function isPromise(obj) {
    return (!!obj &&
        (typeof obj === 'object' || typeof obj === 'function') &&
        typeof obj.then === 'function');
}

var utils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    CountDownLatch: CountDownLatch,
    MsgEvent: MsgEvent,
    doesTabExists: doesTabExists,
    executeScript: executeScript,
    getCurrentTabId: getCurrentTabId,
    getPageSize: getPageSize,
    getTabId: getTabId,
    getWindowId: getWindowId,
    injectScript: injectScript,
    isPromise: isPromise,
    open_new_tab: open_new_tab,
    sleep: sleep,
    waitForTabComplete: waitForTabComplete
});

function isFellouBrowser(chromeProxy) {
    const result = typeof chromeProxy.browseruse == 'object';
    logger.debug("isFellouBrowser", result);
    return result;
}
async function type(chromeProxy, tabId, text, coordinate) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending type message to tab:', tabId, { text, coordinate }, isFellou ? ' > fellou' : '');
    try {
        if (!coordinate) {
            coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
        }
        await mouse_move(chromeProxy, tabId, coordinate);
        let response;
        if (isFellou) {
            let enter = false;
            if (text.endsWith('\n')) {
                enter = true;
                text = text.substring(0, text.length - 1);
            }
            response = await chromeProxy.browseruse.type(tabId, text);
            if (enter) {
                await chromeProxy.browseruse.keyboard.press(tabId, 'Enter');
            }
        }
        else {
            response = await chromeProxy.tabs.sendMessage(tabId, {
                type: 'computer:type',
                text,
                coordinate,
            });
        }
        logger.debug('type Got response:', response);
        return response;
    }
    catch (e) {
        logger.error('Failed to send type message:', e);
        throw e;
    }
}
async function type_by(chromeProxy, tabId, text, xpath, highlightIndex) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending type_by message to tab:', tabId, { text, xpath, highlightIndex }, isFellou ? ' > fellou' : '');
    try {
        let response;
        if (isFellou) {
            let enter = false;
            if (text.endsWith('\n')) {
                enter = true;
                text = text.substring(0, text.length - 1);
            }
            response = await chromeProxy.browseruse.handle.type(tabId, build_fellou_handle_js(xpath, highlightIndex), text);
            if (enter) {
                await chromeProxy.browseruse.keyboard.press(tabId, 'Enter');
            }
        }
        else {
            response = await chromeProxy.tabs.sendMessage(tabId, {
                type: 'computer:type',
                text,
                xpath,
                highlightIndex,
            });
        }
        logger.debug('type_by Got response:', response);
        return response;
    }
    catch (e) {
        logger.error('Failed to send type message:', e);
        throw e;
    }
}
async function enter_by(chromeProxy, tabId, xpath, highlightIndex) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending enter_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
    try {
        let response;
        if (isFellou) {
            response = await chromeProxy.browseruse.keyboard.press(tabId, 'Enter');
        }
        else {
            response = await chromeProxy.tabs.sendMessage(tabId, {
                type: 'computer:type',
                text: '\n',
                xpath,
                highlightIndex,
            });
        }
        logger.debug('enter_by Got response:', response);
        return response;
    }
    catch (e) {
        logger.error('Failed to send enter_by message:', e);
        throw e;
    }
}
async function clear_input(chromeProxy, tabId, coordinate) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending clear_input message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
    try {
        if (!coordinate) {
            coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
        }
        await mouse_move(chromeProxy, tabId, coordinate);
        let response;
        if (isFellou) {
            await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1], { count: 3 });
            response = await chromeProxy.browseruse.keyboard.press(tabId, 'Backspace');
        }
        else {
            response = await chromeProxy.tabs.sendMessage(tabId, {
                type: 'computer:type',
                text: '',
                coordinate,
            });
        }
        logger.debug('clear_input Got response:', response);
        return response;
    }
    catch (e) {
        logger.error('Failed to send clear_input message:', e);
        throw e;
    }
}
async function clear_input_by(chromeProxy, tabId, xpath, highlightIndex) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending clear_input_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
    try {
        let response;
        if (isFellou) {
            await chromeProxy.browseruse.handle.click(tabId, build_fellou_handle_js(xpath, highlightIndex), { count: 3 });
            response = await chromeProxy.browseruse.keyboard.press(tabId, 'Backspace');
        }
        else {
            response = await chromeProxy.tabs.sendMessage(tabId, {
                type: 'computer:type',
                text: '',
                xpath,
                highlightIndex,
            });
        }
        logger.debug('clear_input_by Got response:', response);
        return response;
    }
    catch (e) {
        logger.error('Failed to send clear_input_by message:', e);
        throw e;
    }
}
async function mouse_move(chromeProxy, tabId, coordinate) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending mouse_move message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
    let response;
    if (isFellou) {
        response = await chromeProxy.browseruse.mouse.move(tabId, coordinate[0], coordinate[1]);
    }
    else {
        response = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:mouse_move',
            coordinate,
        });
    }
    logger.debug('mouse_move Got response:', response);
    return response;
}
async function left_click(chromeProxy, tabId, coordinate) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending left_click message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
    if (!coordinate) {
        coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    let response;
    if (isFellou) {
        response = await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1]);
    }
    else {
        response = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:left_click',
            coordinate,
        });
    }
    logger.debug('left_click Got response:', response);
    return response;
}
async function left_click_by(chromeProxy, tabId, xpath, highlightIndex) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending left_click_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
    let response;
    if (isFellou) {
        response = await chromeProxy.browseruse.handle.click(tabId, build_fellou_handle_js(xpath, highlightIndex));
    }
    else {
        response = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:left_click',
            xpath,
            highlightIndex,
        });
    }
    logger.debug('left_click_by Got response:', response);
    return response;
}
async function right_click(chromeProxy, tabId, coordinate) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending right_click message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
    if (!coordinate) {
        coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    let response;
    if (isFellou) {
        response = await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1], { button: 'right' });
    }
    else {
        await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:right_click',
            coordinate,
        });
    }
    logger.debug('right_click Got response:', response);
    return response;
}
async function right_click_by(chromeProxy, tabId, xpath, highlightIndex) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending right_click_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
    let response;
    if (isFellou) {
        response = await chromeProxy.browseruse.handle.click(tabId, build_fellou_handle_js(xpath, highlightIndex), { button: 'right' });
    }
    else {
        await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:right_click',
            xpath,
            highlightIndex,
        });
    }
    logger.debug('right_click_by Got response:', response);
    return response;
}
async function double_click(chromeProxy, tabId, coordinate) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending double_click message to tab:', tabId, { coordinate }, isFellou ? ' > fellou' : '');
    if (!coordinate) {
        coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    }
    let response;
    if (isFellou) {
        response = await chromeProxy.browseruse.mouse.click(tabId, coordinate[0], coordinate[1], { count: 2 });
    }
    else {
        response = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:double_click',
            coordinate,
        });
    }
    logger.debug('double_click Got response:', response);
    return response;
}
async function double_click_by(chromeProxy, tabId, xpath, highlightIndex) {
    const isFellou = isFellouBrowser(chromeProxy);
    logger.debug('Sending double_click_by message to tab:', tabId, { xpath, highlightIndex }, isFellou ? ' > fellou' : '');
    let response;
    if (isFellou) {
        response = await chromeProxy.browseruse.mouse.click(tabId, build_fellou_handle_js(xpath, highlightIndex), { count: 2 });
    }
    else {
        response = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:double_click',
            xpath,
            highlightIndex,
        });
    }
    logger.debug('double_click_by Got response:', response);
    return response;
}
async function screenshot(chromeProxy, windowId, compress) {
    logger.debug('Taking screenshot of window:', windowId, { compress });
    try {
        let dataUrl;
        if (compress) {
            dataUrl = await chromeProxy.tabs.captureVisibleTab(windowId, {
                format: 'jpeg',
                quality: 60, // 0-100
            });
            dataUrl = await compress_image(dataUrl, 0.7, 1);
        }
        else {
            dataUrl = await chromeProxy.tabs.captureVisibleTab(windowId, {
                format: 'jpeg',
                quality: 50,
            });
        }
        let data = dataUrl.substring(dataUrl.indexOf('base64,') + 7);
        const result = {
            image: {
                type: 'base64',
                media_type: dataUrl.indexOf('image/png') > -1 ? 'image/png' : 'image/jpeg',
                data: data,
            },
        };
        logger.debug('screenshot Got screenshot result:', result);
        if (!data || data.length < 30) {
            throw new Error('image error');
        }
        return result;
    }
    catch (e) {
        if (isFellouBrowser(chromeProxy)) {
            logger.debug('Failed to take screenshot, try fellou...');
            const tabId = await getCurrentTabId(chromeProxy, windowId);
            const base64 = await chromeProxy.browseruse.screenshot(tabId, {
                type: 'jpeg',
                quality: 60,
                encoding: 'base64',
            });
            const result = {
                image: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: base64,
                },
            };
            logger.debug('screenshot Got screenshot result, try fellou:', result);
            return result;
        }
        logger.error('Failed to take screenshot:', e);
        throw e;
    }
}
async function compress_image(dataUrl, scale = 0.8, quality = 0.8) {
    logger.debug('Compressing image', { scale, quality });
    try {
        const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
        let width = bitmap.width * scale;
        let height = bitmap.height * scale;
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: quality,
        });
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result;
                logger.debug('Got compressed image result (sliced):', result.slice(0, 200));
                resolve(result);
            };
            reader.onerror = () => {
                resolve(dataUrl);
            };
            reader.readAsDataURL(blob);
        });
    }
    catch (e) {
        logger.error('Failed to compress image:', e);
        return dataUrl;
    }
}
async function scroll_to(chromeProxy, tabId, coordinate) {
    logger.debug('Sending scroll_to message to tab:', tabId, { coordinate });
    let from_coordinate = (await cursor_position(chromeProxy, tabId)).coordinate;
    const response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:scroll_to',
        from_coordinate,
        to_coordinate: coordinate,
    });
    logger.debug('scroll_to Got response:', response);
    return response;
}
async function scroll_to_by(chromeProxy, tabId, xpath, highlightIndex) {
    logger.debug('Sending scroll_to_by message to tab:', tabId, { xpath, highlightIndex });
    const response = await chromeProxy.tabs.sendMessage(tabId, {
        type: 'computer:scroll_to',
        xpath,
        highlightIndex,
    });
    logger.debug('scroll_to_by Got response:', response);
    return response;
}
async function get_dropdown_options(chromeProxy, tabId, xpath, highlightIndex) {
    logger.debug('Sending get_dropdown_options message to tab:', tabId, { xpath, highlightIndex });
    try {
        const response = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:get_dropdown_options',
            xpath,
            highlightIndex,
        });
        logger.debug('get_dropdown_options Got response:', response);
        return response;
    }
    catch (e) {
        logger.error('Failed to send get_dropdown_options message:', e);
        throw e;
    }
}
async function select_dropdown_option(chromeProxy, tabId, text, xpath, highlightIndex) {
    logger.debug('Sending select_dropdown_option message to tab:', tabId, { text, xpath, highlightIndex });
    try {
        const response = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:select_dropdown_option',
            text,
            xpath,
            highlightIndex,
        });
        logger.debug('select_dropdown_option Got response:', response);
        return response;
    }
    catch (e) {
        logger.error('Failed to send select_dropdown_option message:', e);
        throw e;
    }
}
async function cursor_position(chromeProxy, tabId) {
    logger.debug('Sending cursor_position message to tab:', tabId);
    try {
        let result = await chromeProxy.tabs.sendMessage(tabId, {
            type: 'computer:cursor_position',
        });
        logger.debug('Got cursor position:', result.coordinate);
        return { coordinate: result.coordinate };
    }
    catch (e) {
        logger.error('Failed to send cursor_position message:', e);
        throw e;
    }
}
async function size(chromeProxy, tabId) {
    logger.debug('Getting page size for tab:', tabId);
    try {
        const pageSize = await getPageSize(chromeProxy, tabId);
        logger.debug('Got page size:', pageSize);
        return pageSize;
    }
    catch (e) {
        logger.error('Failed to get page size:', e);
        throw e;
    }
}
function build_fellou_handle_js(xpath, highlightIndex) {
    if (highlightIndex != undefined) {
        return `get_highlight_element(${highlightIndex})`;
    }
    else {
        return `document.evaluate('${xpath}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`;
    }
}

var browser = /*#__PURE__*/Object.freeze({
    __proto__: null,
    clear_input: clear_input,
    clear_input_by: clear_input_by,
    compress_image: compress_image,
    cursor_position: cursor_position,
    double_click: double_click,
    double_click_by: double_click_by,
    enter_by: enter_by,
    get_dropdown_options: get_dropdown_options,
    left_click: left_click,
    left_click_by: left_click_by,
    mouse_move: mouse_move,
    right_click: right_click,
    right_click_by: right_click_by,
    screenshot: screenshot,
    scroll_to: scroll_to,
    scroll_to_by: scroll_to_by,
    select_dropdown_option: select_dropdown_option,
    size: size,
    type: type,
    type_by: type_by
});

class ToolReturnsScreenshot {
    async execute(context, params) {
        const realResult = await this.realExecute(context, params);
        logger.debug("debug realResult...");
        logger.debug(realResult);
        await sleep(3000); // wait for page loding
        let instance = new BrowserUse();
        const image = await instance.realExecute(context, { action: "screenshot_extract_element" });
        return image;
    }
}

/**
 * Browser Use for general
 */
class BrowserUse extends ToolReturnsScreenshot {
    constructor() {
        super();
        this.name = 'browser_use';
        this.description = `Use structured commands to interact with the browser, manipulating page elements through screenshots and webpage element extraction.
* This is a browser GUI interface where you need to analyze webpages by taking screenshots and extracting page element structures, and specify action sequences to complete designated tasks.
* Before any operation, you must first call the \`screenshot_extract_element\` command, which will return the browser page screenshot and structured element information, both specially processed.
* ELEMENT INTERACTION:
   - Only use indexes that exist in the provided element list
   - Each element has a unique index number (e.g., "[33]:<button>")
   - Elements marked with "[]:" are non-interactive (for context only)
* NAVIGATION & ERROR HANDLING:
   - If no suitable elements exist, use other functions to complete the task
   - If stuck, try alternative approaches
   - Handle popups/cookies by accepting or closing them
   - Use scroll to find elements you are looking for`;
        this.input_schema = {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description: `The action to perform. The available actions are:
* \`screenshot_extract_element\`: Take a screenshot of the web page and extract operable elements.
  - Screenshots are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshots help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshots, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshots.
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_content' instead.
* \`input_text\`: Enter a string in the interactive element, If you need to press the Enter key, please end with '\\n'. For search tasks, you MUST end with '\\n' to simulate pressing the Enter key.
* \`click\`: Click to element.
* \`right_click\`: Right-click on the element.
* \`double_click\`: Double-click on the element.
* \`scroll_to\`: Scroll to the specified element.
* \`extract_content\`: Extract the text content of the current webpage.
* \`get_dropdown_options\`: Get all options from a native dropdown element.
* \`select_dropdown_option\`: Select dropdown option for interactive element index by the text of the option you want to select.`,
                    enum: [
                        'screenshot_extract_element',
                        'input_text',
                        'click',
                        'right_click',
                        'double_click',
                        'scroll_to',
                        'extract_content',
                        'get_dropdown_options',
                        'select_dropdown_option',
                    ],
                },
                index: {
                    type: 'integer',
                    description: 'index of element, Operation elements must pass the corresponding index of the element',
                },
                text: {
                    type: 'string',
                    description: 'Required by `action=input_text` and `action=select_dropdown_option`',
                },
            },
            required: ['action'],
        };
    }
    /**
     * browser
     *
     * @param {*} params { action: 'input_text', index: 1, text: 'string' }
     * @returns > { success: true, image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' }, text?: string }
     */
    async realExecute(context, params) {
        var _a;
        logger.debug("debug 'browser_use'...");
        logger.debug(params);
        try {
            if (params === null || !params.action) {
                throw new Error('Invalid parameters. Expected an object with a "action" property.');
            }
            let tabId;
            try {
                tabId = await getTabId(context);
                logger.debug(tabId);
                if (!tabId || !Number.isInteger(tabId)) {
                    throw new Error('Could not get valid tab ID');
                }
            }
            catch (e) {
                logger.error('Tab ID error:', e);
                return { success: false, error: 'Could not access browser tab' };
            }
            let windowId = await getWindowId(context);
            let selector_map = context.selector_map;
            let selector_xpath;
            if (params.index != null && selector_map) {
                selector_xpath = (_a = selector_map[params.index]) === null || _a === void 0 ? void 0 : _a.xpath;
                if (!selector_xpath) {
                    throw new Error('Element does not exist');
                }
            }
            let result;
            logger.debug("switch cases...");
            switch (params.action) {
                case 'input_text':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    if (params.text == null) {
                        throw new Error('text parameter is required');
                    }
                    await clear_input_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
                    result = await type_by(context.ekoConfig.chromeProxy, tabId, params.text, selector_xpath, params.index);
                    await sleep(200);
                    break;
                case 'click':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await left_click_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
                    await sleep(100);
                    break;
                case 'right_click':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await right_click_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
                    await sleep(100);
                    break;
                case 'double_click':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await double_click_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
                    await sleep(100);
                    break;
                case 'scroll_to':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await scroll_to_by(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
                    await sleep(500);
                    break;
                case 'extract_content':
                    let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
                    await injectScript(context.ekoConfig.chromeProxy, tabId);
                    await sleep(200);
                    let content = await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
                        return eko.extractHtmlContent();
                    }, []);
                    result = {
                        title: tab.title,
                        url: tab.url,
                        content: content,
                    };
                    break;
                case 'get_dropdown_options':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    result = await get_dropdown_options(context.ekoConfig.chromeProxy, tabId, selector_xpath, params.index);
                    break;
                case 'select_dropdown_option':
                    if (params.index == null) {
                        throw new Error('index parameter is required');
                    }
                    if (params.text == null) {
                        throw new Error('text parameter is required');
                    }
                    result = await select_dropdown_option(context.ekoConfig.chromeProxy, tabId, params.text, selector_xpath, params.index);
                    break;
                case 'screenshot_extract_element':
                    logger.debug("execute 'screenshot_extract_element'...");
                    await sleep(100);
                    logger.debug("injectScript...");
                    await injectScript(context.ekoConfig.chromeProxy, tabId, 'build_dom_tree.js');
                    await sleep(100);
                    try {
                        logger.debug("executeScript...");
                        let element_result = await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
                            return window.get_clickable_elements(true);
                        }, []);
                        context.selector_map = element_result.selector_map;
                        logger.debug("browser.screenshot...");
                        let screenshot$1 = await screenshot(context.ekoConfig.chromeProxy, windowId, true);
                        result = { image: screenshot$1.image, text: element_result.element_str };
                    }
                    finally {
                        await sleep(500);
                        logger.debug("executeScript #2...");
                        await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
                            return window.remove_highlight();
                        }, []);
                    }
                    logger.debug("execute 'screenshot_extract_element'...done");
                    break;
                default:
                    throw Error(`Invalid parameters. The "${params.action}" value is not included in the "action" enumeration.`);
            }
            logger.debug(`execute 'browser_use'...done, result=${result}`);
            return result;
        }
        catch (e) {
            logger.error('Browser use error:', e);
            return { success: false, error: e === null || e === void 0 ? void 0 : e.message };
        }
    }
    destroy(context) {
        delete context.selector_map;
    }
}

function exportFile(filename, type, content) {
    const blob = new Blob([content], { type: type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

/**
 * Export file
 */
class ExportFile {
    constructor() {
        this.name = 'export_file';
        this.description = 'Export a text file with content. You should call this tool ONLY when user requires to export a file.';
        this.input_schema = {
            type: 'object',
            properties: {
                fileType: {
                    type: 'string',
                    description: 'File format type',
                    enum: ['txt', 'csv', 'md', 'html', 'js', 'xml', 'json', 'yml', 'sql'],
                },
                content: {
                    type: 'string',
                    description: 'Export file content',
                },
                filename: {
                    type: 'string',
                    description: 'File name',
                },
            },
            required: ['fileType', 'content'],
        };
    }
    /**
     * export
     *
     * @param {*} params { fileType: 'csv', content: 'field1,field2\ndata1,data2' }
     * @returns > { success: true }
     */
    async execute(context, params) {
        var _a, _b, _c, _d, _e, _f;
        if (typeof params !== 'object' || params === null || !('content' in params)) {
            throw new Error('Invalid parameters. Expected an object with a "content" property.');
        }
        await ((_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onExportFile) === null || _c === void 0 ? void 0 : _c.call(_b, params));
        let type = 'text/plain';
        switch (params.fileType) {
            case 'csv':
                type = 'text/csv';
                break;
            case 'md':
                type = 'text/markdown';
                break;
            case 'html':
                type = 'text/html';
                break;
            case 'js':
                type = 'application/javascript';
                break;
            case 'xml':
                type = 'text/xml';
                break;
            case 'json':
                type = 'application/json';
                break;
        }
        let filename;
        if (!params.filename) {
            filename = new Date().getTime() + '.' + params.fileType;
        }
        else if (!(params.filename + '').endsWith(params.fileType)) {
            filename = params.filename + '.' + params.fileType;
        }
        else {
            filename = params.filename;
        }
        try {
            let tabId = await getTabId(context);
            await context.ekoConfig.chromeProxy.scripting.executeScript({
                target: { tabId: tabId },
                func: exportFile,
                args: [filename, type, params.content],
            });
        }
        catch (e) {
            let tab;
            const url = 'https://www.google.com';
            if (context.ekoConfig.workingWindowId) {
                tab = await open_new_tab(context.ekoConfig.chromeProxy, url, context.ekoConfig.workingWindowId);
            }
            else {
                tab = await open_new_tab(context.ekoConfig.chromeProxy, url);
            }
            (_f = (_e = (_d = context.callback) === null || _d === void 0 ? void 0 : _d.hooks) === null || _e === void 0 ? void 0 : _e.onTabCreated) === null || _f === void 0 ? void 0 : _f.call(_e, tab.id);
            let tabId = tab.id;
            await context.ekoConfig.chromeProxy.scripting.executeScript({
                target: { tabId: tabId },
                func: exportFile,
                args: [filename, type, params.content],
            });
            await sleep(5000);
            await context.ekoConfig.chromeProxy.tabs.remove(tabId);
        }
        return { success: true };
    }
}

/**
 * Extract Page Content
 */
class ExtractContent {
    constructor() {
        this.name = 'extract_content';
        this.description = 'Extract the complete text content of the current webpage';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    /**
     * Extract Page Content
     *
     * @param {*} params {}
     * @returns > { tabId, result: { title, url, content }, success: true }
     */
    async execute(context, params) {
        let tabId = await getTabId(context);
        let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
        await injectScript(context.ekoConfig.chromeProxy, tabId);
        await sleep(500);
        let content = await executeScript(context.ekoConfig.chromeProxy, tabId, () => {
            return eko.extractHtmlContent();
        }, []);
        return {
            tabId,
            result: {
                title: tab.title,
                url: tab.url,
                content: content,
            }
        };
    }
}

class GetAllTabs {
    constructor() {
        this.name = 'get_all_tabs';
        this.description = 'Get the tabId, title, url and content from current all tabs without opening new tab.';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    async execute(context, params) {
        const currentWindow = await context.ekoConfig.chromeProxy.windows.getCurrent();
        const windowId = currentWindow.id;
        const tabs = await context.ekoConfig.chromeProxy.tabs.query({ windowId });
        const tabsInfo = [];
        for (const tab of tabs) {
            if (tab.id === undefined) {
                logger.warn(`Tab ID is undefined for tab with URL: ${tab.url}`);
                continue;
            }
            await injectScript(context.ekoConfig.chromeProxy, tab.id);
            await sleep(500);
            let content = await executeScript(context.ekoConfig.chromeProxy, tab.id, () => {
                return eko.extractHtmlContent();
            }, []);
            // Use title as description, but requirement may evolve
            let description = tab.title ? tab.title : "No description available.";
            const tabInfo = {
                id: tab.id,
                url: tab.url,
                title: tab.title,
                content: content,
                description: description,
            };
            logger.debug(tabInfo);
            tabsInfo.push(tabInfo);
        }
        return tabsInfo;
    }
}

/**
 * Open Url
 */
class OpenUrl extends ToolReturnsScreenshot {
    constructor() {
        super();
        this.name = 'open_url';
        this.description = 'Open the specified URL link in browser window';
        this.input_schema = {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL link address',
                },
                newWindow: {
                    type: 'boolean',
                    description: 'true: Open in a new window; false: Open in the current window.',
                },
            },
            required: ['url'],
        };
    }
    /**
     * Open Url
     *
     * @param {*} params { url: 'https://www.google.com', newWindow: true }
     * @returns > { tabId, windowId, title, success: true }
     */
    async realExecute(context, params) {
        var _a, _b, _c, _d, _e, _f;
        // 参数验证
        if (typeof params !== 'object' || params === null || !params.url) {
            logger.error('Invalid parameters. Expected an object with a "url" property.');
            throw new Error('Invalid parameters. Expected an object with a "url" property.');
        }
        // 提取参数
        let url = params.url.trim();
        let newWindow = params.newWindow;
        logger.debug('URL to open:', url);
        logger.debug('Initial newWindow value:', newWindow);
        // 根据上下文调整 newWindow 的值
        if (context.ekoConfig.workingWindowId) {
            logger.debug('Working window ID exists in context, setting newWindow to false.');
            newWindow = false;
        }
        else if (!newWindow && !context.variables.get('windowId') && !context.variables.get('tabId')) {
            // First mandatory opening of a new window
            logger.debug('No existing window or tab ID found, forcing newWindow to true.');
            newWindow = true;
        }
        logger.debug('Final newWindow value:', newWindow);
        // 打开新标签页
        let tab;
        if (newWindow) {
            logger.debug('Opening new tab in a new window.');
            tab = await open_new_tab(context.ekoConfig.chromeProxy, url);
            (_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onTabCreated) === null || _c === void 0 ? void 0 : _c.call(_b, tab.id);
            logger.debug('New tab created in a new window:', tab.id);
        }
        else {
            let windowId = context.ekoConfig.workingWindowId ? context.ekoConfig.workingWindowId : await getWindowId(context);
            logger.debug('Using existing window with ID:', windowId);
            try {
                tab = await open_new_tab(context.ekoConfig.chromeProxy, url, windowId);
                logger.debug("Calling hook...");
                (_f = (_e = (_d = context.callback) === null || _d === void 0 ? void 0 : _d.hooks) === null || _e === void 0 ? void 0 : _e.onTabCreated) === null || _f === void 0 ? void 0 : _f.call(_e, tab.id);
                logger.debug('New tab created in existing window:', tab.id);
            }
            catch (e) {
                logger.error("An error occurs when `open_url`", e);
                throw e;
            }
        }
        // 获取窗口和标签 ID
        let windowId = tab.windowId;
        let tabId = tab.id;
        logger.debug('Tab ID:', tabId, 'Window ID:', windowId);
        // 更新上下文变量
        context.variables.set('windowId', windowId);
        context.variables.set('tabId', tabId);
        logger.debug('Updated context variables:', context.variables);
        // 处理新窗口的 windowIds
        if (newWindow) {
            let windowIds = context.variables.get('windowIds');
            if (windowIds) {
                logger.debug('Existing window IDs:', windowIds);
                windowIds.push(windowId);
                logger.debug('Updated window IDs:', windowIds);
            }
            else {
                logger.debug('No existing window IDs found, creating new array.');
                context.variables.set('windowIds', [windowId]);
            }
        }
        // 返回结果
        let result = {
            tabId,
            windowId,
            title: tab.title,
        };
        logger.debug('Returning result:', result);
        return result;
    }
}

/**
 * Current Page Screenshot
 */
class Screenshot {
    constructor() {
        this.name = 'screenshot';
        this.description = 'Screenshot the current webpage window';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    /**
     * Current Page Screenshot
     *
     * @param {*} params {}
     * @returns > { image: { type: 'base64', media_type: 'image/png', data } }
     */
    async execute(context, params) {
        let windowId = await getWindowId(context);
        return await screenshot(context.ekoConfig.chromeProxy, windowId);
    }
}

/**
 * Browser tab management
 */
class TabManagement {
    constructor() {
        this.name = 'tab_management';
        this.description = 'Browser tab management, view and operate tabs.You can use this tool to' +
            'View all tabs with the tabId and title.Get current tab information (tabId, url, title).' +
            'Go back to the previous page in the current tab. And Close the current tab.';
        this.input_schema = {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: `The command to perform. The available commands are:
* \`tab_all\`: View all tabs and return the tabId and title.
* \`current_tab\`: Get current tab information (tabId, url, title).
* \`go_back\`: Go back to the previous page in the current tab.
* \`close_tab\`: Close the current tab.`,
                    enum: ['tab_all', 'current_tab', 'go_back', 'close_tab'],
                },
            },
            required: ['command'],
        };
    }
    /**
     * Tab management
     *
     * @param {*} params { command: `new_tab [url]` | 'tab_all' | 'current_tab' | 'go_back' | 'close_tab' | 'switch_tab [tabId]'  }
     * @returns > { result, success: true }
     */
    async execute(context, params) {
        if (params === null || !params.command) {
            throw new Error('Invalid parameters. Expected an object with a "command" property.');
        }
        let windowId = await getWindowId(context);
        let command = params.command.trim();
        if (command.startsWith('`')) {
            command = command.substring(1);
        }
        if (command.endsWith('`')) {
            command = command.substring(0, command.length - 1);
        }
        let result;
        if (command == 'tab_all') {
            result = [];
            let tabs = await context.ekoConfig.chromeProxy.tabs.query({ windowId: windowId });
            for (let i = 0; i < tabs.length; i++) {
                let tab = tabs[i];
                let tabInfo = {
                    tabId: tab.id,
                    windowId: tab.windowId,
                    title: tab.title,
                    url: tab.url,
                };
                if (tab.active) {
                    tabInfo.active = true;
                }
                result.push(tabInfo);
            }
        }
        else if (command == 'current_tab') {
            let tabId = await getTabId(context);
            let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
            let tabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
            result = tabInfo;
        }
        else if (command == 'go_back') {
            let tabId = await getTabId(context);
            await context.ekoConfig.chromeProxy.tabs.goBack(tabId);
            let tab = await context.ekoConfig.chromeProxy.tabs.get(tabId);
            let tabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
            result = tabInfo;
        }
        else if (command == 'close_tab') {
            let closedTabId = await getTabId(context);
            await context.ekoConfig.chromeProxy.tabs.remove(closedTabId);
            await sleep(100);
            let tabs = await context.ekoConfig.chromeProxy.tabs.query({ active: true, currentWindow: true });
            if (tabs.length == 0) {
                tabs = await context.ekoConfig.chromeProxy.tabs.query({ status: 'complete', currentWindow: true });
            }
            let tab = tabs[tabs.length - 1];
            if (!tab.active) {
                await context.ekoConfig.chromeProxy.tabs.update(tab.id, { active: true });
            }
            let newTabId = tab.id;
            context.variables.set('tabId', tab.id);
            context.variables.set('windowId', tab.windowId);
            let closeTabInfo = { closedTabId, newTabId, newTabTitle: tab.title };
            result = closeTabInfo;
        }
        else {
            throw Error('Unknown command: ' + command);
        }
        return result;
    }
    destroy(context) {
        let windowIds = context.variables.get('windowIds');
        if (windowIds) {
            for (let i = 0; i < windowIds.length; i++) {
                context.ekoConfig.chromeProxy.windows.remove(windowIds[i]);
            }
        }
    }
}

/**
 * Web Search
 */
class WebSearch {
    constructor() {
        this.name = 'web_search';
        this.description = 'Search the web based on keywords and return relevant extracted content from webpages.';
        this.input_schema = {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'the URL of search engine, like https://www.bing.com'
                },
                query: {
                    type: 'string',
                    description: 'search for keywords',
                },
                maxResults: {
                    type: 'integer',
                    description: 'Maximum search results, default 5',
                },
            },
            required: ['query'],
        };
    }
    /**
     * search
     *
     * @param {*} params { url: 'https://www.google.com', query: 'ai agent', maxResults: 5 }
     * @returns > [{ title, url, content }]
     */
    async execute(context, params) {
        var _a, _b;
        if (typeof params !== 'object' || params === null || !params.query) {
            throw new Error('Invalid parameters. Expected an object with a "query" property.');
        }
        let url = (_a = params.url) === null || _a === void 0 ? void 0 : _a.trim();
        let query = params.query;
        let maxResults = params.maxResults;
        if (!url) {
            url = 'https://www.bing.com';
        }
        let taskId = new Date().getTime() + '';
        let searchs = [{ url: url, keyword: query }];
        let searchInfo = await deepSearch(context, taskId, searchs, maxResults || 5, context.ekoConfig.workingWindowId);
        let links = ((_b = searchInfo.result[0]) === null || _b === void 0 ? void 0 : _b.links) || [];
        return links.filter((s) => s.content);
    }
}
const deepSearchInjects = {
    'bing.com': {
        filename: 'bing.js',
        buildSearchUrl: function (url, keyword) {
            return 'https://bing.com/search?q=' + encodeURI(keyword);
        },
    },
    'duckduckgo.com': {
        filename: 'duckduckgo.js',
        buildSearchUrl: function (url, keyword) {
            return 'https://duckduckgo.com/?q=' + encodeURI(keyword);
        },
    },
    'google.com': {
        filename: 'google.js',
        buildSearchUrl: function (url, keyword) {
            return 'https://www.google.com/search?q=' + encodeURI(keyword);
        },
    },
    default: {
        filename: 'google.js',
        buildSearchUrl: function (url, keyword) {
            url = url.trim();
            let idx = url.indexOf('//');
            if (idx > -1) {
                url = url.substring(idx + 2);
            }
            idx = url.indexOf('/', 2);
            if (idx > -1) {
                url = url.substring(0, idx);
            }
            keyword = 'site:' + url + ' ' + keyword;
            return 'https://www.google.com/search?q=' + encodeURIComponent(keyword);
        },
    },
};
function buildDeepSearchUrl(url, keyword) {
    let idx = url.indexOf('/', url.indexOf('//') + 2);
    let baseUrl = idx > -1 ? url.substring(0, idx) : url;
    let domains = Object.keys(deepSearchInjects);
    let inject = null;
    for (let j = 0; j < domains.length; j++) {
        let domain = domains[j];
        if (baseUrl == domain || baseUrl.endsWith('.' + domain) || baseUrl.endsWith('/' + domain)) {
            inject = deepSearchInjects[domain];
            break;
        }
    }
    if (!inject) {
        inject = deepSearchInjects['default'];
    }
    return {
        filename: inject.filename,
        url: inject.buildSearchUrl(url, keyword),
    };
}
// Event
const tabsUpdateEvent = new MsgEvent();
// TODO: replace `chrome` with `context.ekoConfig.chromeProxy`
if (typeof chrome !== 'undefined' && typeof chrome.tabs !== 'undefined') {
    chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
        await tabsUpdateEvent.publish({ tabId, changeInfo, tab });
    });
}
/**
 * deep search
 *
 * @param {string} taskId task id
 * @param {array} searchs search list => [{ url: 'https://bing.com', keyword: 'ai' }]
 * @param {number} detailsMaxNum Maximum crawling quantity per search detail page
 */
async function deepSearch(context, taskId, searchs, detailsMaxNum, windowId) {
    let closeWindow = false;
    if (!windowId) {
        // open new window
        let window = await context.ekoConfig.chromeProxy.windows.create({
            type: 'normal',
            state: 'maximized',
            url: null,
        });
        windowId = window.id;
        closeWindow = true;
    }
    windowId = windowId;
    // crawler the search page details page link
    // [{ links: [{ title, url }] }]
    let detailLinkGroups = await doDetailLinkGroups(context, taskId, searchs, detailsMaxNum, windowId);
    // crawler all details page content and comments
    let searchInfo = await doPageContent(context, taskId, detailLinkGroups, windowId);
    logger.debug('searchInfo: ', searchInfo);
    // close window
    closeWindow && context.ekoConfig.chromeProxy.windows.remove(windowId);
    return searchInfo;
}
/**
 * crawler the search page details page link
 *
 * @param {string} taskId task id
 * @param {array} searchs search list => [{ url: 'https://bing.com', keyword: 'ai' }]
 * @param {number} detailsMaxNum Maximum crawling quantity per search detail page
 * @param {*} window
 * @returns [{ links: [{ title, url }] }]
 */
async function doDetailLinkGroups(context, taskId, searchs, detailsMaxNum, windowId) {
    var _a, _b, _c;
    let detailLinkGroups = [];
    let countDownLatch = new CountDownLatch(searchs.length);
    for (let i = 0; i < searchs.length; i++) {
        try {
            // script name & build search URL
            const { filename, url } = buildDeepSearchUrl(searchs[i].url, searchs[i].keyword);
            // open new Tab
            let tab = await context.ekoConfig.chromeProxy.tabs.create({
                url: url,
                windowId,
            });
            (_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onTabCreated) === null || _c === void 0 ? void 0 : _c.call(_b, tab.id);
            let eventId = taskId + '_' + i;
            // monitor Tab status
            tabsUpdateEvent.addListener(async function (obj) {
                if (obj.tabId != tab.id) {
                    return;
                }
                if (obj.changeInfo.status === 'complete') {
                    tabsUpdateEvent.removeListener(eventId);
                    // inject js
                    await injectScript(context.ekoConfig.chromeProxy, tab.id, filename);
                    await sleep(1000);
                    // crawler the search page details page
                    // { links: [{ title, url }] }
                    let detailLinks = await context.ekoConfig.chromeProxy.tabs.sendMessage(tab.id, {
                        type: 'page:getDetailLinks',
                        keyword: searchs[i].keyword,
                    });
                    logger.debug('detailLinks: ', detailLinks);
                    if (!detailLinks || !detailLinks.links) {
                        logger.error("detailLinks is empty");
                        throw new Error("An error occurs when calling `web_search`, please try again.");
                    }
                    let links = detailLinks.links.slice(0, detailsMaxNum);
                    detailLinkGroups.push({ url, links, filename });
                    countDownLatch.countDown();
                    context.ekoConfig.chromeProxy.tabs.remove(tab.id);
                }
                else if (obj.changeInfo.status === 'unloaded') {
                    countDownLatch.countDown();
                    context.ekoConfig.chromeProxy.tabs.remove(tab.id);
                    tabsUpdateEvent.removeListener(eventId);
                }
            }, eventId);
        }
        catch (e) {
            logger.error(e);
            countDownLatch.countDown();
        }
    }
    await countDownLatch.await(30000);
    return detailLinkGroups;
}
/**
 * page content
 *
 * @param {string} taskId task id
 * @param {array} detailLinkGroups details page group
 * @param {*} window
 * @returns search info
 */
async function doPageContent(context, taskId, detailLinkGroups, windowId) {
    var _a, _b, _c;
    const searchInfo = {
        total: 0,
        running: 0,
        succeed: 0,
        failed: 0,
        failedLinks: [],
        result: detailLinkGroups,
    };
    for (let i = 0; i < detailLinkGroups.length; i++) {
        let links = detailLinkGroups[i].links;
        searchInfo.total += links.length;
    }
    let countDownLatch = new CountDownLatch(searchInfo.total);
    for (let i = 0; i < detailLinkGroups.length; i++) {
        let filename = detailLinkGroups[i].filename;
        let links = detailLinkGroups[i].links;
        for (let j = 0; j < links.length; j++) {
            let link = links[j];
            // open new tab
            let tab = await context.ekoConfig.chromeProxy.tabs.create({
                url: link.url,
                windowId,
            });
            (_c = (_b = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks) === null || _b === void 0 ? void 0 : _b.onTabCreated) === null || _c === void 0 ? void 0 : _c.call(_b, tab.id);
            searchInfo.running++;
            let eventId = taskId + '_' + i + '_' + j;
            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Page load timeout')), 10000); // Timeout after 10 seconds
            });
            // Create a tab monitoring promise
            const monitorTabPromise = new Promise(async (resolve, reject) => {
                tabsUpdateEvent.addListener(async function onTabUpdated(obj) {
                    if (obj.tabId !== tab.id)
                        return;
                    if (obj.changeInfo.status === 'complete') {
                        tabsUpdateEvent.removeListener(eventId);
                        try {
                            // Inject script and get page content
                            await injectScript(context.ekoConfig.chromeProxy, tab.id, filename);
                            await sleep(1000);
                            let result = await context.ekoConfig.chromeProxy.tabs.sendMessage(tab.id, {
                                type: 'page:getContent',
                            });
                            if (!result)
                                throw new Error('No Result');
                            link.content = result.content;
                            link.page_title = result.title;
                            searchInfo.succeed++;
                            resolve(); // Resolve the promise if successful
                        }
                        catch (error) {
                            searchInfo.failed++;
                            searchInfo.failedLinks.push(link);
                            reject(error); // Reject the promise on error
                        }
                        finally {
                            searchInfo.running--;
                            countDownLatch.countDown();
                            context.ekoConfig.chromeProxy.tabs.remove(tab.id);
                            tabsUpdateEvent.removeListener(eventId);
                        }
                    }
                    else if (obj.changeInfo.status === 'unloaded') {
                        searchInfo.running--;
                        countDownLatch.countDown();
                        context.ekoConfig.chromeProxy.tabs.remove(tab.id);
                        tabsUpdateEvent.removeListener(eventId);
                        reject(new Error('Tab unloaded')); // Reject if the tab is unloaded
                    }
                }, eventId);
            });
            // Use Promise.race to enforce the timeout
            try {
                await Promise.race([monitorTabPromise, timeoutPromise]);
            }
            catch (e) {
                logger.error(`${link.title} failed:`, e);
                searchInfo.running--;
                searchInfo.failed++;
                searchInfo.failedLinks.push(link);
                countDownLatch.countDown();
                context.ekoConfig.chromeProxy.tabs.remove(tab.id); // Clean up tab on failure
            }
        }
    }
    await countDownLatch.await(60000);
    return searchInfo;
}

class RequestLogin {
    constructor() {
        this.name = 'request_login';
        this.description =
            'Login to this website, assist with identity verification when manual intervention is needed, guide users through the login process, and wait for their confirmation of successful login.';
        this.input_schema = {
            type: 'object',
            properties: {},
        };
    }
    async execute(context, params) {
        if (!params.force && await this.isLoginIn(context)) {
            return true;
        }
        let tabId = await getTabId(context);
        let task_id = 'login_required_' + tabId;
        const request_user_help = async () => {
            await context.ekoConfig.chromeProxy.tabs.sendMessage(tabId, {
                type: 'request_user_help',
                task_id,
                failure_type: 'login_required',
                failure_message: 'Access page require user authentication.',
            });
        };
        const login_interval = setInterval(async () => {
            try {
                request_user_help();
            }
            catch (e) {
                clearInterval(login_interval);
            }
        }, 2000);
        try {
            return await this.awaitLogin(context.ekoConfig.chromeProxy, tabId, task_id);
        }
        finally {
            clearInterval(login_interval);
        }
    }
    async awaitLogin(chromeProxy, tabId, task_id) {
        return new Promise((resolve) => {
            const checkTabClosedInterval = setInterval(async () => {
                const tabExists = await doesTabExists(chromeProxy, tabId);
                if (!tabExists) {
                    clearInterval(checkTabClosedInterval);
                    resolve(false);
                    chromeProxy.runtime.onMessage.removeListener(listener);
                }
            }, 1000);
            const listener = (message) => {
                if (message.type === 'issue_resolved' && message.task_id === task_id) {
                    resolve(true);
                    clearInterval(checkTabClosedInterval);
                }
            };
            chromeProxy.runtime.onMessage.addListener(listener);
        });
    }
    async isLoginIn(context) {
        let windowId = await getWindowId(context);
        let screenshot_result = await screenshot(context.ekoConfig.chromeProxy, windowId, true);
        let messages = [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: screenshot_result.image,
                    },
                    {
                        type: 'text',
                        text: 'Check if the current website is logged in. If not logged in, output `NOT_LOGIN`. If logged in, output `LOGGED_IN`. Output directly without explanation.',
                    },
                ],
            },
        ];
        let response = await context.llmProvider.generateText(messages, { maxTokens: 256 });
        let text = response.textContent;
        if (!text) {
            text = JSON.stringify(response.content);
        }
        return text.indexOf('LOGGED_IN') > -1;
    }
}

class SwitchTab {
    constructor() {
        this.name = 'switch_tab';
        this.description = 'Switch to the specified tab using tabId';
        this.input_schema = {
            type: 'object',
            properties: {
                tabId: {
                    type: 'integer',
                    description: 'The tabId to switch to',
                },
            },
            required: ['tabId'],
        };
    }
    async execute(context, params) {
        if (params === null || !params.tabId) {
            throw new Error('Invalid parameters. Expected an object with a "tabId" property.');
        }
        let result;
        let tabId = parseInt(String(params.tabId));
        let tab = await context.ekoConfig.chromeProxy.tabs.update(tabId, { active: true });
        context.variables.set('tabId', tab.id);
        context.variables.set('windowId', tab.windowId);
        let tabInfo = { tabId, windowId: tab.windowId, title: tab.title, url: tab.url };
        result = tabInfo;
        return result;
    }
}

class CancelWorkflow {
    constructor() {
        this.name = 'cancel_workflow';
        this.description = 'Cancel the workflow when encountering critical errors that cannot be resolved through user interaction or retry. This should only be used when the workflow is in an unrecoverable state. ';
        this.input_schema = {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Why the workflow should be cancelled.',
                },
            },
            required: ['reason'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.reason) {
            throw new Error('Invalid parameters. Expected an object with a "reason" property.');
        }
        const reason = params.reason;
        logger.info("The workflow has been cancelled because: " + reason);
        await ((_a = context.workflow) === null || _a === void 0 ? void 0 : _a.cancel());
        return;
    }
}

class HumanInputText {
    constructor() {
        this.name = 'human_input_text';
        this.description = 'When you are unsure about the details of your next action or need the user to perform a local action, call me and ask the user for details in the "question" field. The user will provide you with a text as an answer.';
        this.input_schema = {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'Ask the user here. Should follow the format: "Please input ...".',
                },
            },
            required: ['question'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.question) {
            throw new Error('Invalid parameters. Expected an object with a "question" property.');
        }
        const question = params.question;
        logger.debug("question: " + question);
        let onHumanInputText = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanInputText;
        if (onHumanInputText) {
            let answer;
            try {
                answer = await onHumanInputText(question);
            }
            catch (e) {
                logger.warn(e);
                return { status: "Error: Cannot get user's answer.", answer: "" };
            }
            logger.debug("answer: " + answer);
            return { status: "OK", answer: answer };
        }
        else {
            logger.error("`onHumanInputText` not implemented");
            return { status: "Error: Cannot get user's answer.", answer: "" };
        }
    }
}
class HumanInputSingleChoice {
    constructor() {
        this.name = 'human_input_single_choice';
        this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE choice as an answer.';
        this.input_schema = {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'Ask the user here. Should follow the format: "Please select ...".',
                },
                choices: {
                    type: 'array',
                    description: 'All of the choices.',
                    items: {
                        type: 'object',
                        properties: {
                            choice: {
                                type: 'string',
                            }
                        }
                    }
                }
            },
            required: ['question', 'choices'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
            throw new Error('Invalid parameters. Expected an object with a "question" and "choices" property.');
        }
        const question = params.question;
        const choices = params.choices.map((e) => e.choice);
        logger.debug("question: " + question);
        logger.debug("choices: " + choices);
        let onHumanInputSingleChoice = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanInputSingleChoice;
        if (onHumanInputSingleChoice) {
            let answer;
            try {
                answer = await onHumanInputSingleChoice(question, choices);
            }
            catch (e) {
                logger.warn(e);
                return { status: "Error: Cannot get user's answer.", answer: "" };
            }
            logger.debug("answer: " + answer);
            return { status: "OK", answer: answer };
        }
        else {
            logger.error("`onHumanInputSingleChoice` not implemented");
            return { status: "Error: Cannot get user's answer.", answer: "" };
        }
    }
}
class HumanInputMultipleChoice {
    constructor() {
        this.name = 'human_input_multiple_choice';
        this.description = 'When you are unsure about the details of your next action, call me and ask the user for details in the "question" field with at least 2 choices. The user will provide you with ONE or MORE choice as an answer.';
        this.input_schema = {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'Ask the user here. Should follow the format: "Please select ...".',
                },
                choices: {
                    type: 'array',
                    description: 'All of the choices.',
                    items: {
                        type: 'object',
                        properties: {
                            choice: {
                                type: 'string',
                            }
                        }
                    }
                }
            },
            required: ['question', 'choices'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
            throw new Error('Invalid parameters. Expected an object with a "question" and "choices" property.');
        }
        const question = params.question;
        const choices = params.choices.map((e) => e.choice);
        logger.debug("question: " + question);
        logger.debug("choices: " + choices);
        let onHumanInputMultipleChoice = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanInputMultipleChoice;
        if (onHumanInputMultipleChoice) {
            let answer;
            try {
                answer = await onHumanInputMultipleChoice(question, choices);
            }
            catch (e) {
                logger.warn(e);
                return { status: "Error: Cannot get user's answer.", answer: [] };
            }
            logger.debug("answer: " + answer);
            return { status: "OK", answer: answer };
        }
        else {
            logger.error("`onHumanInputMultipleChoice` not implemented");
            return { status: "Error: Cannot get user's answer.", answer: [] };
        }
    }
}
class HumanOperate {
    constructor() {
        this.name = 'human_operate';
        this.description = `Use this tool when one of following appears:
1. Authentication (such as logging in, entering a verification code, etc.)
2. External system operations (such as uploading files, selecting a file save location, scanning documents, taking photos, paying, authorization, etc.)

NOTE: You should ONLY use this tool in the scenarios above.

When calling this tool to transfer control to the user, please explain in detail:
1. Why user intervention is required
2. What operations the user needs to perform`;
        this.input_schema = {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'The reason why you need to transfer control. Should follow the format: "Please ..., and click the "Completed" button to continue.".',
                },
            },
            required: ['reason'],
        };
    }
    async execute(context, params) {
        var _a;
        if (typeof params !== 'object' || params === null || !params.reason) {
            throw new Error('Invalid parameters. Expected an object with a "reason" property.');
        }
        const reason = params.reason;
        logger.debug("reason: " + reason);
        let onHumanOperate = (_a = context.callback) === null || _a === void 0 ? void 0 : _a.hooks.onHumanOperate;
        if (onHumanOperate) {
            let userOperation;
            try {
                userOperation = await onHumanOperate(reason);
            }
            catch (e) {
                logger.warn(e);
                return { status: "Error: Cannot get user's operation.", userOperation: "" };
            }
            logger.debug("userOperation: " + userOperation);
            if (userOperation == "") {
                return { status: "OK", userOperation: "Done. Please take a screenshot to ensure the result." };
            }
            else {
                return { status: "OK", userOperation: userOperation + "\n\nPlease take a screenshot to ensure the result." };
            }
        }
        else {
            logger.error("`onHumanOperate` not implemented");
            return { status: "Error: Cannot get user's operation.", userOperation: "" };
        }
    }
}

class DocumentAgentTool {
    constructor() {
        this.name = 'document_agent';
        this.description = 'A document agent that can help you write document or long text, e.g. research report, email draft, summary.';
        this.input_schema = {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "The type of document to be created (e.g., 'report', 'presentation', 'article')."
                },
                "title": {
                    "type": "string",
                    "description": "The title of the document."
                },
                "background": {
                    "type": "string",
                    "description": "The background information or target for the document."
                },
                "keypoints": {
                    "type": "string",
                    "description": "A summary of the key points or main ideas to be included in the document."
                },
                "style": {
                    "type": "string",
                    "description": "The desired style or tone of the document (e.g., 'formal', 'casual', 'academic')."
                },
            },
            "required": ["type", "title", "background", "keypoints"],
        };
    }
    async execute(context, params) {
        params.references = context.variables;
        const messages = [
            {
                role: 'system',
                content: 'You are an excellent writer, skilled at composing various types of copywriting and texts in different styles. You can draft documents based on the title, background, or reference materials provided by clients. Now, the client will provide you with a lot of information, including the type of copywriting, title, background, key points, style, and reference materials. Please write a document in Markdown format.',
            },
            {
                role: 'user',
                content: JSON.stringify(params),
            },
        ];
        const llmParams = { maxTokens: 8192 };
        const response = await context.llmProvider.generateText(messages, llmParams);
        const content = typeof response.content == 'string' ? response.content : response.content[0].text;
        context.variables.set("workflow_transcript", content);
        return { status: "OK", content };
    }
}

var tools = /*#__PURE__*/Object.freeze({
    __proto__: null,
    BrowserUse: BrowserUse,
    CancelWorkflow: CancelWorkflow,
    DocumentAgentTool: DocumentAgentTool,
    ExportFile: ExportFile,
    ExtractContent: ExtractContent,
    GetAllTabs: GetAllTabs,
    HumanInputMultipleChoice: HumanInputMultipleChoice,
    HumanInputSingleChoice: HumanInputSingleChoice,
    HumanInputText: HumanInputText,
    HumanOperate: HumanOperate,
    OpenUrl: OpenUrl,
    RequestLogin: RequestLogin,
    Screenshot: Screenshot,
    SwitchTab: SwitchTab,
    TabManagement: TabManagement,
    WebSearch: WebSearch
});

async function pub(chromeProxy, tabId, event, params) {
    return await chromeProxy.tabs.sendMessage(tabId, {
        type: 'eko:message',
        event,
        params,
    });
}
async function getLLMConfig(chromeProxy, name = 'llmConfig') {
    let result = await chromeProxy.storage.sync.get([name]);
    return result[name];
}
function loadTools() {
    let toolsMap = new Map();
    for (const key in tools) {
        let tool = tools[key];
        if (typeof tool === 'function' && tool.prototype && 'execute' in tool.prototype) {
            try {
                let instance = new tool();
                toolsMap.set(instance.name || key, instance);
            }
            catch (e) {
                logger.error(`Failed to instantiate ${key}:`, e);
            }
        }
    }
    return toolsMap;
}

exports.browser = browser;
exports.getLLMConfig = getLLMConfig;
exports.loadTools = loadTools;
exports.pub = pub;
exports.tools = tools;
exports.utils = utils;
