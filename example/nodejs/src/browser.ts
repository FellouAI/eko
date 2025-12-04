import os from "os";
import fs from "fs";
import path from "path";
import { promises as fsPromises } from "fs";
import chromeCookies from "chrome-cookies-secure";
import { BrowserAgent } from "@eko-ai/eko-nodejs";
import { AgentContext } from "@eko-ai/eko";
import { Level } from "level";

export default class LocalCookiesBrowserAgent extends BrowserAgent {
  private caches: Record<string, boolean> = {};
  private localStorageCaches: Record<string, Record<string, string>> = {};
  private profileName: string =
    LocalCookiesBrowserAgent.getLastUsedProfileName();

  protected async loadLocalStorageWithUrl(
    url: string
  ): Promise<Record<string, string>> {
    const urlObj = new URL(url);
    const origin = urlObj.origin;
    if (this.localStorageCaches[origin]) {
      return this.localStorageCaches[origin];
    }

    let tempDir: string | null = null;
    let db: Level<string, Buffer> | null = null;

    try {
      const localStoragePath = this.getLocalStoragePath();
      if (!fs.existsSync(localStoragePath)) {
        return {};
      }

      // 复制 LevelDB 到临时目录（因为 Chrome 可能正在使用）
      tempDir = path.join(os.tmpdir(), `chrome-ls-${Date.now()}`);
      await this.copyDirectory(localStoragePath, tempDir);

      // 打开 LevelDB
      db = new Level(tempDir, {
        valueEncoding: "binary",
        keyEncoding: "binary",
      } as any);

      const result: Record<string, string> = {};
      const urlOrigin = urlObj.origin;
      const urlHref = urlObj.href;
      const urlHostname = urlObj.hostname;

      // 遍历所有键值对
      for await (const [rawKey, rawVal] of db.iterator()) {
        const key = rawKey.toString();

        // Chrome localStorage keys format: "_https://example.commyKey" 或 "_https://example.com/^0partitionKeymyKey"
        if (key.startsWith("_")) {
          let storageKey = "";
          let matched = false;

          // 优先精确匹配 origin
          if (key.startsWith(`_${urlOrigin}`)) {
            storageKey = key.substring(`_${urlOrigin}`.length);
            matched = true;
          } else if (key.startsWith(`_${urlHref}`)) {
            storageKey = key.substring(`_${urlHref}`.length);
            matched = true;
          } else {
            // 尝试匹配 hostname（处理不同协议或端口的情况）
            const hostnamePattern = new RegExp(`^_https?://${urlHostname.replace(/\./g, "\\.")}`);
            if (hostnamePattern.test(key)) {
              // 提取 origin 部分（从 _ 到第一个非 origin 字符）
              const originMatch = key.match(/^_(https?:\/\/[^/]+)/);
              if (originMatch) {
                const keyOrigin = originMatch[1];
                // 如果 hostname 匹配，提取 storageKey
                if (keyOrigin.includes(urlHostname)) {
                  storageKey = key.substring(originMatch[0].length);
                  matched = true;
                }
              }
            }
          }

          if (matched && storageKey) {
            // 处理分区键的情况（格式：/^0partitionKeystorageKey）
            // 例如：/^0https://google.comyt-remote-connected-devices
            if (storageKey.startsWith("/^0")) {
              const afterPartition = storageKey.substring(3);
              // 分区键通常是完整的 URL（如 https://google.com）
              // storageKey 通常以字母或下划线开头
              // 从后往前匹配，找到 storageKey 的开始位置
              // storageKey 模式：字母/下划线开头，包含字母、数字、下划线、连字符、冒号
              const storageKeyPattern = /([a-zA-Z_][a-zA-Z0-9_:-]+)$/;
              const keyMatch = afterPartition.match(storageKeyPattern);
              if (keyMatch) {
                storageKey = keyMatch[1];
                // 验证前面确实是 URL 格式
                const beforeKey = afterPartition.substring(0, afterPartition.length - keyMatch[1].length);
                if (beforeKey.match(/^https?:\/\//)) {
                  // 确认是有效的分区键格式
                } else {
                  // 如果不是 URL 格式，可能整个都是 storageKey
                  storageKey = afterPartition;
                }
              } else {
                // 如果无法匹配，尝试直接使用（可能是特殊格式）
                storageKey = afterPartition;
              }
            }

            // 清理 storageKey 中的控制字符（\x00, \x01 等）
            storageKey = storageKey.replace(/[\x00-\x1F]/g, "");

            // 解析值（可能是 JSON 格式）
            let rawValue = rawVal.toString();
            // 清理 value 中的控制字符（\x00, \x01 等）
            rawValue = rawValue.replace(/[\x00-\x1F]/g, "");
            
            try {
              const parsed = JSON.parse(rawValue);
              // 如果解析成功且是对象，检查是否有 data 字段
              if (typeof parsed === "object" && parsed !== null && "data" in parsed) {
                result[storageKey] =
                  typeof parsed.data === "string"
                    ? parsed.data
                    : JSON.stringify(parsed.data);
              } else {
                result[storageKey] = rawValue;
              }
            } catch {
              // 不是 JSON，直接使用原始值
              result[storageKey] = rawValue;
            }
          }
        }
      }

      await db.close();
      db = null;

      // 清理临时目录
      await fsPromises.rm(tempDir, { recursive: true, force: true });
      tempDir = null;

      this.localStorageCaches[origin] = result;

      console.log("===> localStorage: ", result);

      return result;
    } catch (e) {
      console.error("Failed to load localStorage:", e);
      // 确保清理资源
      if (db) {
        try {
          await db.close();
        } catch (closeError) {
          // 忽略关闭错误
        }
      }
      if (tempDir) {
        try {
          await fsPromises.rm(tempDir, { recursive: true, force: true });
        } catch (rmError) {
          // 忽略删除错误
        }
      }
      return {};
    }
  }

  private getLocalStoragePath(): string {
    if (process.platform === "darwin") {
      return path.resolve(
        os.homedir(),
        `Library/Application Support/Google/Chrome/${this.profileName}/Local Storage/leveldb`
      );
    } else if (process.platform === "linux") {
      return path.resolve(
        os.homedir(),
        `.config/google-chrome/${this.profileName}/Local Storage/leveldb`
      );
    } else if (process.platform === "win32") {
      return path.resolve(
        os.homedir(),
        `AppData\\Local\\Google\\Chrome\\User Data\\${this.profileName}\\Local Storage\\leveldb`
      );
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fsPromises.mkdir(dest, { recursive: true });
    const entries = await fsPromises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
    }
  }

  protected async loadCookiesWithUrl(url: string): Promise<
    Array<{
      name: string;
      value: string;
      url?: string;
      domain?: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
      partitionKey?: string;
    }>
  > {
    const domain = new URL(url).host;
    if (this.caches[domain]) {
      return [];
    }
    const cookies = await chromeCookies.getCookiesPromised(
      url,
      "puppeteer",
      this.profileName
    );
    this.caches[domain] = true;
    if (cookies && cookies.length > 0) {
      // Chrome 的 expires_utc 是从 1601-01-01 开始的微秒数（WebKit Time）
      // 需要转换成 Unix 时间戳（从 1970-01-01 开始的秒数）
      const WEBKIT_EPOCH_OFFSET_SECONDS = 11644473600; // 1601 到 1970 的秒数差
      
      for (let i = 0; i < cookies.length; i++) {
        if (cookies[i].expires) {
          const expiresValue = Number(cookies[i].expires);
          
          // 判断是否是 WebKit Time（通常是 17 位数字的微秒）
          if (expiresValue > 10000000000000) { // > 10^13，说明是微秒级别
            // 从 1601 年开始的微秒数，转换为 Unix 时间戳（秒）
            cookies[i].expires = Math.floor(expiresValue / 1000000) - WEBKIT_EPOCH_OFFSET_SECONDS;
          } else if (expiresValue > 10000000000) { // 毫秒级
            cookies[i].expires = Math.floor(expiresValue / 1000);
          }
          // 否则已经是秒级，保持不变
        }
      }
    }
    console.log("===> cookies: ", url, cookies);
    const mapped = cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      secure: cookie.Secure,
      httpOnly: cookie.HttpOnly,
    }));
    console.log("===> mapped cookies: ", mapped);
    return mapped;
  }

  private static getLastUsedProfileName(): string {
    let chromeBasePath: string;
    if (process.platform === "darwin") {
      chromeBasePath = path.resolve(
        os.homedir(),
        "Library/Application Support/Google/Chrome/Local State"
      );
    } else if (process.platform === "linux") {
      chromeBasePath = path.resolve(
        os.homedir(),
        ".config/google-chrome/Local State"
      );
    } else if (process.platform === "win32") {
      chromeBasePath = path.resolve(
        os.homedir(),
        "AppData\\Local\\Google\\Chrome\\User Data\\Local State"
      );
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }

    const localStateJson = fs.readFileSync(chromeBasePath, "utf8");
    const localState = JSON.parse(localStateJson);
    if (localState.profile.last_used) {
      return localState.profile.last_used;
    } else if (localState.profile.last_active_profiles.length > 0) {
      return localState.profile.last_active_profiles[0];
    } else if (
      localState.profile.info_cache["Profile 1"] &&
      !localState.profile.info_cache["Default"]
    ) {
      return "Profile 1";
    } else {
      return "Default";
    }
  }
  public async openUrl(url: string): Promise<void> {
    await this.navigate_to({} as AgentContext, url);
  }
}

export { LocalCookiesBrowserAgent };
