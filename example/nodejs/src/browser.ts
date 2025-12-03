import os from "os";
import fs from "fs";
import chromeCookies from "chrome-cookies-secure";
import { BrowserAgent } from "@eko-ai/eko-nodejs";
import { AgentContext } from "@eko-ai/eko";

export default class LocalCookiesBrowserAgent extends BrowserAgent {
  private caches: Record<string, boolean> = {};
  private profileName: string =
    LocalCookiesBrowserAgent.getLastUsedProfileName();

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
      for (let i = 0; i < cookies.length; i++) {
        if (cookies[i].expires && (cookies[i].expires + "").length > 10) {
          cookies[i].expires = Number(
            (cookies[i].expires + "").substring(0, 10)
          );
        }
      }
    }
    console.log("===> cookies: ", url, JSON.stringify(cookies));
    return cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      secure: cookie.Secure,
      httpOnly: cookie.HttpOnly,
    }));
  }

  private static getLastUsedProfileName(): string {
    let chromeBasePath;
    if (process.platform === "darwin") {
      chromeBasePath =
        process.env.HOME +
        `/Library/Application Support/Google/Chrome/Local State`;
    } else if (process.platform === "linux") {
      chromeBasePath = process.env.HOME + `/.config/google-chrome/Local State`;
    } else if (process.platform === "win32") {
      chromeBasePath =
        os.homedir() +
        `\\AppData\\Local\\Google\\Chrome\\User Data\\Local State`;
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
