import { ILogObj, IMeta, ISettings, Logger } from "tslog";

function transportFormatted(logMetaMarkup: string, logArgs: unknown[], logErrors: string[], settings: ISettings<ILogObj>) {
  const logErrorsStr = (logErrors.length > 0 && logArgs.length > 0 ? "\n" : "") + logErrors.join("\n");
  settings.prettyInspectOptions.colors = settings.stylePrettyLogs;
  console.log(logMetaMarkup, ...logArgs, logErrorsStr);
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
