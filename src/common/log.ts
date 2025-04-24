import { ILogObj, IMeta, ISettings, Logger } from "tslog";

function transportFormatted(logMetaMarkup: string, logArgs: unknown[], logErrors: string[], settings: ISettings<ILogObj>) {
  settings.prettyInspectOptions.colors = settings.stylePrettyLogs;
  const logLevel = logMetaMarkup.trim().split(" ")[2];
  let logFunc;
  switch (logLevel) {
    case "WARN":
      logFunc = console.warn;
      break;
    case "ERROR":
    case "FATAL":
      logFunc = console.error;
      break;
    case "INFO":
      logFunc = console.info;
      break;
    case "DEBUG":
    case "TRACE":
    case "SILLY":
    default:
      logFunc = console.debug;
      break;
  }
  logFunc(logMetaMarkup, ...logArgs);
  logErrors.forEach(err => {
    console.error(logMetaMarkup + err);
  });
}

function formatMeta(logObjMeta?: IMeta): string {
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

export const logger = new Logger<ILogObj>({
  name: "ekoLogger",
  overwrite: {
    transportFormatted,
    formatMeta,
  }
});
