import { hostname } from 'os';
import { normalize } from 'path';
import { types, formatWithOptions } from 'util';

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
    hostname: hostname ? hostname() : undefined,
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
        const filePathWithLine = normalize(`${filePath}:${fileLine}`);
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
    return types?.isNativeError != null ? types.isNativeError(e) : e instanceof Error;
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
    console.log(logMetaMarkup + formatWithOptions(settings.prettyInspectOptions, ...logArgs) + logErrorsStr);
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

if (!window.eko) {
    window.eko = { lastMouseX: 0, lastMouseY: 0 };
}
eko.sub = function (event, callback) {
    if (!eko.subListeners) {
        eko.subListeners = {};
    }
    if (event && callback) {
        eko.subListeners[event] = callback;
    }
};
document.addEventListener('mousemove', (event) => {
    eko.lastMouseX = event.clientX;
    eko.lastMouseY = event.clientY;
});
if (typeof chrome !== 'undefined') {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        (async () => {
            try {
                switch (request.type) {
                    case 'eko:message': {
                        let result = null;
                        if (eko.subListeners && eko.subListeners[request.event]) {
                            try {
                                result = await eko.subListeners[request.event](request.params);
                            }
                            catch (e) {
                                logger.error(e);
                            }
                        }
                        sendResponse(result);
                        break;
                    }
                    case 'page:getDetailLinks': {
                        let result = await eko.getDetailLinks(request.search);
                        sendResponse(result);
                        break;
                    }
                    case 'page:getContent': {
                        let result = await eko.getContent(request.search);
                        sendResponse(result);
                        break;
                    }
                    case 'request_user_help': {
                        request_user_help(request.task_id, request.failure_type, request.failure_message);
                        sendResponse(true);
                        break;
                    }
                    case 'computer:type': {
                        sendResponse(type(request));
                        break;
                    }
                    case 'computer:mouse_move': {
                        sendResponse(mouse_move(request));
                        break;
                    }
                    case 'computer:left_click': {
                        sendResponse(simulateMouseEvent(request, ['mousedown', 'mouseup', 'click'], 0));
                        break;
                    }
                    case 'computer:right_click': {
                        sendResponse(simulateMouseEvent(request, ['mousedown', 'mouseup', 'contextmenu'], 2));
                        break;
                    }
                    case 'computer:double_click': {
                        sendResponse(simulateMouseEvent(request, ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick'], 0));
                        break;
                    }
                    case 'computer:scroll_to': {
                        sendResponse(scroll_to(request));
                        break;
                    }
                    case 'computer:cursor_position': {
                        sendResponse({ coordinate: [eko.lastMouseX, eko.lastMouseY] });
                        break;
                    }
                    case 'computer:get_dropdown_options': {
                        sendResponse(get_dropdown_options(request));
                        break;
                    }
                    case 'computer:select_dropdown_option': {
                        sendResponse(select_dropdown_option(request));
                        break;
                    }
                }
            }
            catch (e) {
                logger.error('onMessage error', e);
                sendResponse(false);
            }
        })();
        return true;
    });
}
function type(request) {
    let text = request.text;
    let enter = false;
    if (text.endsWith('\\n')) {
        enter = true;
        text = text.substring(0, text.length - 2);
    }
    else if (text.endsWith('\n')) {
        enter = true;
        text = text.substring(0, text.length - 1);
    }
    let element;
    if (request.highlightIndex != null) {
        element = window.get_highlight_element(request.highlightIndex);
    }
    else if (request.xpath) {
        let xpath = request.xpath;
        let result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
    }
    else {
        let coordinate = request.coordinate;
        element = document.elementFromPoint(coordinate[0], coordinate[1]) || document.activeElement;
    }
    if (!element) {
        return false;
    }
    let input;
    if (element.tagName == 'IFRAME') {
        let iframeDoc = element.contentDocument || element.contentWindow.document;
        input =
            iframeDoc.querySelector('textarea') ||
                iframeDoc.querySelector('*[contenteditable="true"]') ||
                iframeDoc.querySelector('input');
    }
    else if (element.tagName == 'INPUT' ||
        element.tagName == 'TEXTAREA' ||
        element.childElementCount == 0) {
        input = element;
    }
    else {
        input = element.querySelector('input') || element.querySelector('textarea');
        if (!input) {
            input = element.querySelector('*[contenteditable="true"]') || element;
            if (input.tagName == 'DIV') {
                input = input.querySelector('span') || input.querySelector('div') || input;
            }
        }
    }
    input.focus && input.focus();
    if (!text) {
        if (input.value == undefined) {
            input.textContent = '';
        }
        else {
            input.value = '';
        }
    }
    else {
        if (input.value == undefined) {
            input.textContent += text;
        }
        else {
            input.value += text;
        }
    }
    let result = input.dispatchEvent(new Event('input', { bubbles: true }));
    if (enter) {
        ['keydown', 'keypress', 'keyup'].forEach((eventType) => {
            const event = new KeyboardEvent(eventType, {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                bubbles: true,
                cancelable: true,
            });
            input.dispatchEvent(event);
        });
    }
    logger.debug('type', input, request, result);
    return true;
}
function mouse_move(request) {
    let coordinate = request.coordinate;
    let x = coordinate[0];
    let y = coordinate[1];
    const event = new MouseEvent('mousemove', {
        view: window,
        bubbles: true,
        cancelable: true,
        screenX: x,
        screenY: y,
        clientX: x,
        clientY: y,
    });
    let result = document.body.dispatchEvent(event);
    logger.debug('mouse_move', document.body, request, result);
    return true;
}
function simulateMouseEvent(request, eventTypes, button) {
    let element;
    if (request.highlightIndex != null) {
        element = window.get_highlight_element(request.highlightIndex);
    }
    else if (request.xpath) {
        let xpath = request.xpath;
        let result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
    }
    else {
        let coordinate = request.coordinate;
        element = document.elementFromPoint(coordinate[0], coordinate[1]) || document.body;
    }
    if (!element) {
        return false;
    }
    const x = undefined;
    const y = undefined;
    for (let i = 0; i < eventTypes.length; i++) {
        const event = new MouseEvent(eventTypes[i], {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button, // 0 left; 2 right
        });
        let result = element.dispatchEvent(event);
        logger.debug('simulateMouse', element, { ...request, eventTypes, button }, result);
    }
    return true;
}
function scroll_to(request) {
    if (request.highlightIndex != null) {
        let element = window.get_highlight_element(request.highlightIndex);
        if (!element) {
            return false;
        }
        element.scrollIntoView({
            behavior: 'smooth',
        });
    }
    else if (request.xpath) {
        let xpath = request.xpath;
        let result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        let element = result.singleNodeValue;
        if (!element) {
            return false;
        }
        element.scrollIntoView({
            behavior: 'smooth',
        });
    }
    else {
        const to_coordinate = request.to_coordinate;
        window.scrollTo({
            left: to_coordinate[0],
            top: to_coordinate[1],
            behavior: 'smooth',
        });
    }
    logger.debug('scroll_to', request);
    return true;
}
function get_dropdown_options(request) {
    let select;
    if (request.highlightIndex != null) {
        select = window.get_highlight_element(request.highlightIndex);
    }
    else if (request.xpath) {
        select = document.evaluate(request.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }
    if (!select) {
        return null;
    }
    return {
        options: Array.from(select.options).map((opt) => ({
            index: opt.index,
            text: opt.text.trim(),
            value: opt.value,
        })),
        id: select.id,
        name: select.name,
    };
}
function select_dropdown_option(request) {
    let select;
    if (request.highlightIndex != null) {
        select = window.get_highlight_element(request.highlightIndex);
    }
    else if (request.xpath) {
        select = document.evaluate(request.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }
    if (!select || select.tagName.toUpperCase() !== 'SELECT') {
        return { success: false, error: 'Select not found or invalid element type' };
    }
    const option = Array.from(select.options).find((opt) => opt.text.trim() === request.text);
    if (!option) {
        return {
            success: false,
            error: 'Option not found',
            availableOptions: Array.from(select.options).map((o) => o.text.trim()),
        };
    }
    select.value = option.value;
    select.dispatchEvent(new Event('change'));
    return {
        success: true,
        selectedValue: option.value,
        selectedText: option.text.trim(),
    };
}
function request_user_help(task_id, failure_type, failure_message) {
    const domId = 'eko-request-user-help';
    if (document.getElementById(domId)) {
        return;
    }
    const failureTitleMap = {
        login_required: 'Login Required',
        captcha: 'Captcha Detected',
        blocked: 'Blocked',
        other: 'Error',
        rate_limited: 'Rate Limited',
    };
    const notification = document.createElement('div');
    notification.id = domId;
    notification.style.cssText = `
    position: fixed;
    top: 5px;
    left: 18px;
    z-index: 999999;
    background-color: #FEF0ED;
    color: white;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid #FBB8A5;
    font-family: Arial, sans-serif;
    width: 350px;
    display: flex;
    flex-direction: row;
    gap: 10px;
    cursor: move;
    user-select: none;
  `;
    let isDragging = false;
    let xOffset = 0;
    let yOffset = 0;
    let initialX = 0;
    let initialY = 0;
    notification.addEventListener('mousedown', (e) => {
        isDragging = true;
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging)
            return;
        const currentX = e.clientX - initialX;
        const currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        notification.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    const leftContainer = document.createElement('div');
    leftContainer.style.cssText = `
    width: 28px;
    height: 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-radius: 99px;
    background: #FDCCCC;
    justify-content: center;
  `;
    leftContainer.innerHTML = ``;
    const rightContainer = document.createElement('div');
    rightContainer.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
  `;
    const title = document.createElement('div');
    title.style.cssText = `
    font-size: 16px;
    font-weight: 700;
    line-height: 22px;
    color: #DD342D;
    text-align: left;
  `;
    title.innerText = failureTitleMap[failure_type] || failure_type;
    const message2 = document.createElement('div');
    message2.style.cssText = `
    font-size: 16px;
    font-weight: 400;
    line-height: 22px;
    color: #DD342D;
    text-align: left;
  `;
    message2.innerText = failure_message + '\nWhen you resolve the issue, click the button below.';
    const buttonDiv = document.createElement('div');
    buttonDiv.style.cssText = `
    margin-top: 16px;
    display: flex;
    flex-direction: row-reverse;
    justify-content: flex-start;
    align-items: center;
  `;
    const resolvedBut = document.createElement('div');
    resolvedBut.innerText = 'Resolved';
    resolvedBut.style.cssText = `
    border-radius: 8px;
    background: #DD342D;
    color: white;
    padding: 10px;
    border: none;
    cursor: pointer;
  `;
    resolvedBut.onclick = () => {
        chrome.runtime.sendMessage({ type: 'issue_resolved', task_id, failure_type }, () => {
            notification.remove();
        });
    };
    buttonDiv.appendChild(resolvedBut);
    rightContainer.appendChild(title);
    rightContainer.appendChild(message2);
    rightContainer.appendChild(buttonDiv);
    notification.appendChild(leftContainer);
    notification.appendChild(rightContainer);
    document.body.appendChild(notification);
}
