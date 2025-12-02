export function isJsonStr(str?: string): boolean {
  str = str ?? "";
  str = str.trim();
  if (!str) {
    return false;
  }
  if (!str.startsWith("{") && !str.endsWith("[")) {
    return false;
  }
  try {
    JSON.parse(str);
    return true;
  } catch (error) {
    return false;
  }
}
