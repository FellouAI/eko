import os from "os";
import fs from "fs";
import path from "path";
import { Level } from "level";
import { promises } from "fs";
import chromeCookies from "chrome-cookies-secure";
import { BrowserAgent } from "@eko-ai/eko-nodejs";

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

      tempDir = path.join(os.tmpdir(), `chrome-ls-${Date.now()}`);
      await this.copyDirectory(localStoragePath, tempDir);

      db = new Level(tempDir, {
        valueEncoding: "binary",
        keyEncoding: "binary",
      } as any);

      const result: Record<string, string> = {};
      const urlOrigin = urlObj.origin;
      const urlHref = urlObj.href;
      const urlHostname = urlObj.hostname;

      for await (const [rawKey, rawVal] of db.iterator()) {
        const key = rawKey.toString();

        // Chrome localStorage keys format: "_https://example.commyKey" or "_https://example.com/^0partitionKeymyKey"
        if (key.startsWith("_")) {
          let storageKey = "";
          let matched = false;

          // Priority precise matching origin
          if (key.startsWith(`_${urlOrigin}`)) {
            storageKey = key.substring(`_${urlOrigin}`.length);
            matched = true;
          } else if (key.startsWith(`_${urlHref}`)) {
            storageKey = key.substring(`_${urlHref}`.length);
            matched = true;
          } else {
            // Attempt to match hostname (handle cases with different protocols or ports)
            const hostnamePattern = new RegExp(
              `^_https?://${urlHostname.replace(/\./g, "\\.")}`
            );
            if (hostnamePattern.test(key)) {
              // Extract the "origin" section (from _ to the first non-"origin" character)
              const originMatch = key.match(/^_(https?:\/\/[^/]+)/);
              if (originMatch) {
                const keyOrigin = originMatch[1];
                if (keyOrigin.includes(urlHostname)) {
                  storageKey = key.substring(originMatch[0].length);
                  matched = true;
                }
              }
            }
          }

          if (matched && storageKey) {
            // Handling partition key cases (format: /^0partitionKeystorageKey)
            // For example: /^0https://google.comyt-remote-connected-devices
            if (storageKey.startsWith("/^0")) {
              const afterPartition = storageKey.substring(3);
              const storageKeyPattern = /([a-zA-Z_][a-zA-Z0-9_:-]+)$/;
              const keyMatch = afterPartition.match(storageKeyPattern);
              if (keyMatch) {
                storageKey = keyMatch[1];
                const beforeKey = afterPartition.substring(
                  0,
                  afterPartition.length - keyMatch[1].length
                );
                if (beforeKey.match(/^https?:\/\//)) {
                  // Confirm that it is a valid partition key format
                } else {
                  storageKey = afterPartition;
                }
              } else {
                storageKey = afterPartition;
              }
            }

            storageKey = storageKey.replace(/[\x00-\x1F]/g, "");

            let rawValue = rawVal.toString();
            rawValue = rawValue.replace(/[\x00-\x1F]/g, "");

            try {
              const parsed = JSON.parse(rawValue);
              if (
                typeof parsed === "object" &&
                parsed !== null &&
                "data" in parsed
              ) {
                result[storageKey] =
                  typeof parsed.data === "string"
                    ? parsed.data
                    : JSON.stringify(parsed.data);
              } else {
                result[storageKey] = rawValue;
              }
            } catch {
              result[storageKey] = rawValue;
            }
          }
        }
      }

      await db.close();
      db = null;

      await promises.rm(tempDir, { recursive: true, force: true });
      tempDir = null;

      this.localStorageCaches[origin] = result;

      return result;
    } catch (e) {
      console.error("Failed to load localStorage:", e);
      if (db) {
        try {
          await db.close();
        } catch (closeError) {}
      }
      if (tempDir) {
        try {
          await promises.rm(tempDir, { recursive: true, force: true });
        } catch (rmError) {}
      }
      return {};
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await promises.mkdir(dest, { recursive: true });
    const entries = await promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await promises.copyFile(srcPath, destPath);
      }
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
      // Chrome's expires_utc is the number of microseconds (WebKit Time) starting from 1601-01-01.
      // The needs to be converted to a Unix timestamp (the number of seconds since 1970-01-01).
      const WEBKIT_EPOCH_OFFSET_SECONDS = 11644473600; // The difference in seconds between 1601 and 1970

      for (let i = 0; i < cookies.length; i++) {
        if (cookies[i].expires) {
          const expiresValue = Number(cookies[i].expires);
          // Determine whether it is a WebKit Time (usually a microsecond with 17 digits)
          if (expiresValue > 10000000000000) {
            cookies[i].expires =
              Math.floor(expiresValue / 1000000) - WEBKIT_EPOCH_OFFSET_SECONDS;
          } else if (expiresValue > 10000000000) {
            // Millisecond
            cookies[i].expires = Math.floor(expiresValue / 1000);
          }
        }
      }
    }
    const mapped = cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      secure: cookie.Secure,
      httpOnly: cookie.HttpOnly,
    }));
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

  public async testOpenUrl(url: string): Promise<void> {
    await this.navigate_to({} as any, url);
  }
}

export { LocalCookiesBrowserAgent };
