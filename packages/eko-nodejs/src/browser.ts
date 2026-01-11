import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { AgentContext, BaseBrowserLabelsAgent, Log } from "@eko-ai/eko";
import { Page, Browser, ElementHandle, BrowserContext } from "playwright";

var tabId = 1000;

type PageInfo = {
  tabId: number;
  lastAccessed: number;
};

export class BrowserAgent extends BaseBrowserLabelsAgent {
  private cdpWsEndpoint?: string;
  private userDataDir?: string;
  private options?: Record<string, any>;
  private cookies?: Array<any>;
  protected browser: Browser | null = null;
  private browserContext: BrowserContext | null = null;
  private activePage: Page | null = null;
  private headless: boolean = false;

  private pageMap = new Map<Page, PageInfo>();
  protected lastSwitchedPage: Page | null = null;

  public setHeadless(headless: boolean) {
    this.headless = headless;
  }

  public setCdpWsEndpoint(cdpWsEndpoint: string) {
    this.cdpWsEndpoint = cdpWsEndpoint;
  }

  public initUserDataDir(userDataDir: string): string | undefined {
    this.userDataDir = userDataDir;
    return this.userDataDir;
  }

  public setCookies(
    cookies: Array<{
      name: string;
      value: string;
      url?: string;
      domain?: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
    }>
  ) {
    this.cookies = cookies;
  }

  public setOptions(options?: Record<string, any>) {
    this.options = options;
  }

  protected async screenshot(
    agentContext: AgentContext
  ): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png" }> {
    const page = await this.currentPage();
    const screenshotBuffer = await page.screenshot({
      fullPage: false,
      type: "jpeg",
      quality: 60,
    });
    const base64 = screenshotBuffer.toString("base64");
    return {
      imageType: "image/jpeg",
      imageBase64: base64,
    };
  }

  protected async navigate_to(
    agentContext: AgentContext,
    url: string
  ): Promise<{
    url: string;
    title?: string;
    tabId?: number;
  }> {
    const page = await this.open_url(agentContext, url);
    this.lastSwitchedPage = page;
    await this.sleep(200);
    return {
      url: page.url(),
      title: await page.title(),
    };
  }

  public async loadTabs() {
    return await this.get_all_tabs(undefined);
  }

  public getPageMap() {
    return this.pageMap;
  }

  protected async get_all_tabs(agentContext?: AgentContext): Promise<
    Array<{
      tabId: number;
      url: string;
      title: string;
      lastAccessed?: number;
      active: boolean;
    }>
  > {
    if (!this.browserContext) {
      return [];
    }
    const result: Array<{
      tabId: number;
      url: string;
      title: string;
      lastAccessed?: number;
      active: boolean;
    }> = [];
    const pages = this.browserContext.pages();
    for (let i = 0; i < pages.length; i++) {
      let page = pages[i];
      let pageInfo = this.pageMap.get(page);
      if (!pageInfo) {
        pageInfo = {
          tabId: tabId++,
          lastAccessed: Date.now(),
        };
        this.pageMap.set(page, pageInfo);
      }
      result.push({
        tabId: pageInfo.tabId,
        url: page.url(),
        title: await page.title(),
        lastAccessed: pageInfo.lastAccessed,
        active: page === this.activePage,
      });
    }
    return result;
  }

  protected async switch_tab(
    agentContext: AgentContext,
    tabId: number
  ): Promise<{ tabId: number; url: string; title: string }> {
    if (!this.browserContext) {
      throw new Error("tabId does not exist: " + tabId);
    }
    let switchPage: Page | null = null;
    this.pageMap.forEach((pageInfo, page) => {
      if (pageInfo.tabId === tabId) {
        switchPage = page;
        return;
      }
    });
    if (!switchPage) {
      throw new Error("tabId does not exist: " + tabId);
    }
    this.activePage = switchPage;
    this.lastSwitchedPage = switchPage;
    return {
      tabId: tabId,
      url: (switchPage as Page).url(),
      title: await (switchPage as Page).title(),
    };
  }

  protected async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<any> {
    try {
      const elementHandle = await this.get_element(index, true);
      await elementHandle.fill("");
      await elementHandle.fill(text);
      if (enter) {
        await elementHandle.press("Enter");
        await this.sleep(200);
      }
    } catch (e) {
      await super.input_text(agentContext, index, text, enter);
    }
  }

  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any> {
    try {
      const elementHandle = await this.get_element(index, true);
      const box = await elementHandle.boundingBox();
      if (box) {
        const page = await this.currentPage();
        page.mouse.move(
          box.x + box.width / 2 + (Math.random() * 10 - 5),
          box.y + box.height / 2 + (Math.random() * 10 - 5),
          { steps: Math.floor(Math.random() * 5) + 3 }
        );
      }
      await elementHandle.click({
        button,
        clickCount: num_clicks,
        force: false,
        delay: Math.random() * 50 + 20,
      });
    } catch (e) {
      await super.click_element(agentContext, index, num_clicks, button);
    }
  }

  protected async hover_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    try {
      const elementHandle = await this.get_element(index, true);
      elementHandle.hover({ force: true });
    } catch (e) {
      await super.hover_to_element(agentContext, index);
    }
  }

  protected async execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any> {
    const page = await this.currentPage();
    return await page.evaluate(func, ...args);
  }

  private async open_url(
    agentContext: AgentContext,
    url: string
  ): Promise<Page> {
    const browser_context = await this.getBrowserContext();
    const page: Page = await browser_context.newPage();
    // await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setViewportSize({ width: 1536, height: 864 });
    try {
      await this.autoLoadCookies(url);
      await this.autoLoadLocalStorage(page, url);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch (e) {
      if ((e + "").indexOf("Timeout") == -1) {
        throw e;
      }
    }
    this.activePage = page;
    return page;
  }

  protected async currentPage(): Promise<Page> {
    if (this.activePage == null) {
      throw new Error("There is no page, please call navigate_to first");
    }
    const page = this.activePage as Page;
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
    } catch (e) {}
    return page;
  }

  private async get_element(
    index: number,
    findInput?: boolean
  ): Promise<ElementHandle> {
    const page = await this.currentPage();
    return await page.evaluateHandle(
      (params: any) => {
        let element = (window as any).get_highlight_element(params.index);
        if (element && params.findInput) {
          if (
            element.tagName != "INPUT" &&
            element.tagName != "TEXTAREA" &&
            element.childElementCount != 0
          ) {
            element =
              element.querySelector("input") ||
              element.querySelector("textarea") ||
              element;
          }
        }
        return element;
      },
      { index, findInput }
    );
  }

  protected async go_back(agentContext: AgentContext): Promise<void> {
    try {
      await this.execute_script(
        agentContext,
        async () => {
          await (window as any).navigation.back().finished;
        },
        []
      );
      await this.sleep(100);
    } catch (e: any) {
      if (e?.name == "InvalidStateError" && this.lastSwitchedPage) {
        this.activePage && (await this.activePage.close());
        this.activePage = this.lastSwitchedPage;
        this.lastSwitchedPage = null;
      } else {
        throw new Error("Cannot go back");
      }
    }
  }

  private sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
  }

  public async getBrowserContext(): Promise<BrowserContext> {
    if (!this.browserContext) {
      this.activePage = null;
      this.browserContext = null;
      if (this.cdpWsEndpoint) {
        this.browser = (await chromium.connectOverCDP(
          this.cdpWsEndpoint,
          this.options
        )) as unknown as Browser;
        this.browserContext = await this.browser.newContext({
          userAgent: this.getUserAgent(),
          viewport: { width: 1536, height: 864 },
        });
      } else if (this.userDataDir) {
        this.browserContext = (await chromium.launchPersistentContext(
          this.userDataDir,
          {
            headless: this.headless,
            channel: "chrome",
            args: this.getChromiumArgs(),
            ...this.options,
          }
        )) as unknown as BrowserContext;
      } else {
        this.browser = (await chromium.launch({
          headless: this.headless,
          args: this.getChromiumArgs(),
          ...this.options,
        })) as unknown as Browser;
        this.browserContext = await this.browser.newContext({
          userAgent: this.getUserAgent(),
          viewport: { width: 1536, height: 864 },
        });
      }
      // Anti-crawling detection website:
      // https://bot.sannysoft.com/
      // https://www.browserscan.net/
      chromium.use(StealthPlugin());
      const init_script = await this.initScript();
      if (init_script.content || init_script.path) {
        this.browserContext.addInitScript(init_script);
      }
      this.browserContext.on("page", async (page) => {
        this.activePage = page;
        this.pageMap.set(page, {
          tabId: tabId++,
          lastAccessed: Date.now(),
        });
        page.on("framenavigated", async (frame) => {
          if (frame === page.mainFrame()) {
            const url = frame.url();
            if (url.startsWith("http")) {
              await this.autoLoadCookies(url);
              await this.autoLoadLocalStorage(page, url);
            }
          }
        });
        page.on("close", () => {
          this.pageMap.delete(page);
        });
      });
    }
    if (this.cookies) {
      this.browserContext?.addCookies(this.cookies);
    }
    return this.browserContext;
  }

  private async autoLoadCookies(url: string): Promise<void> {
    try {
      const cookies = await this.loadCookiesWithUrl(url);
      if (cookies && cookies.length > 0) {
        await this.browserContext?.clearCookies();
        await this.browserContext?.addCookies(cookies);
      }
    } catch (e) {
      Log.error("Failed to auto load cookies: " + url, e);
    }
  }

  private async autoLoadLocalStorage(page: Page, url: string): Promise<void> {
    try {
      const localStorageData = await this.loadLocalStorageWithUrl(url);
      await page.addInitScript((storage: Record<string, string>) => {
        try {
          for (const [key, value] of Object.entries(storage)) {
            localStorage.setItem(key, value);
          }
        } catch (e) {
          Log.error("Failed to inject localStorage: " + url, e);
        }
      }, localStorageData);
    } catch (e) {
      Log.error("Failed to auto load localStorage: " + url, e);
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
    return [];
  }

  protected async loadLocalStorageWithUrl(
    url: string
  ): Promise<Record<string, string>> {
    return {};
  }

  protected getChromiumArgs(): string[] {
    return [
      "--no-sandbox",
      "--remote-allow-origins=*",
      "--disable-dev-shm-usage",
      "--disable-popup-blocking",
      "--ignore-ssl-errors",
      "--ignore-certificate-errors",
      "--ignore-certificate-errors-spki-list",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-notifications",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ];
  }

  protected getUserAgent(): string | undefined {
    // const userAgents = [
    //   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    //   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    //   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    //   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    // ];
    // return userAgents[Math.floor(Math.random() * userAgents.length)];
    return undefined;
  }

  protected async initScript(): Promise<{ path?: string; content?: string }> {
    return {};
  }

  public async getBrowser(): Promise<Browser | null> {
    return this.browser;
  }

  public async getActivePage(): Promise<Page | null> {
    return this.activePage;
  }

  public async close(): Promise<void> {
    if (this.browserContext) {
      await this.browserContext.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}

export default BrowserAgent;
