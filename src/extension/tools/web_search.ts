import { WebSearchParam, WebSearchResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { MsgEvent, CountDownLatch, sleep, injectScript } from '../utils';

/**
 * Web Search
 */
export class WebSearch implements Tool<WebSearchParam, WebSearchResult[]> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'web_search';
    this.description = 'Search the web based on keywords and return relevant extracted content from webpages.';
    this.input_schema = {
      type: 'object',
      properties: {
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
  async execute(context: ExecutionContext, params: WebSearchParam): Promise<WebSearchResult[]> {
    if (typeof params !== 'object' || params === null || !params.query) {
      throw new Error('Invalid parameters. Expected an object with a "query" property.');
    }
    let url = params.url;
    let query = params.query;
    let maxResults = params.maxResults;
    if (!url) {
      url = 'https://www.google.com';
    }
    let taskId = new Date().getTime() + '';
    let searchs = [{ url: url as string, keyword: query as string }];
    let searchInfo = await deepSearch(context, taskId, searchs, maxResults || 5, context.ekoConfig.workingWindowId);
    let links = searchInfo.result[0]?.links || [];
    return links.filter((s: any) => s.content) as WebSearchResult[];
  }
}

const deepSearchInjects: {
  [key: string]: { filename: string; buildSearchUrl: Function };
} = {
  'bing.com': {
    filename: 'bing.js',
    buildSearchUrl: function (url: string, keyword: string) {
      return 'https://bing.com/search?q=' + encodeURI(keyword);
    },
  },
  'duckduckgo.com': {
    filename: 'duckduckgo.js',
    buildSearchUrl: function (url: string, keyword: string) {
      return 'https://duckduckgo.com/?q=' + encodeURI(keyword);
    },
  },
  'google.com': {
    filename: 'google.js',
    buildSearchUrl: function (url: string, keyword: string) {
      return 'https://www.google.com/search?q=' + encodeURI(keyword);
    },
  },
  default: {
    filename: 'google.js',
    buildSearchUrl: function (url: string, keyword: string) {
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

function buildDeepSearchUrl(url: string, keyword: string) {
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
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  await tabsUpdateEvent.publish({ tabId, changeInfo, tab });
});

/**
 * deep search
 *
 * @param {string} taskId task id
 * @param {array} searchs search list => [{ url: 'https://bing.com', keyword: 'ai' }]
 * @param {number} detailsMaxNum Maximum crawling quantity per search detail page
 */
async function deepSearch(
  context: ExecutionContext,
  taskId: string,
  searchs: Array<{ url: string; keyword: string }>,
  detailsMaxNum: number,
  windowId?: number,
) {
  let closeWindow = false;
  if (!windowId) {
    // open new window
    let window = await chrome.windows.create({
      type: 'normal',
      state: 'maximized',
      url: null,
    } as any as chrome.windows.CreateData);
    windowId = window.id;
    closeWindow = true;
  }
  windowId = windowId as number;
  // crawler the search page details page link
  // [{ links: [{ title, url }] }]
  let detailLinkGroups = await doDetailLinkGroups(context, taskId, searchs, detailsMaxNum, windowId);
  // crawler all details page content and comments
  let searchInfo = await doPageContent(context, taskId, detailLinkGroups, windowId);
  console.log('searchInfo: ', searchInfo);
  // close window
  closeWindow && chrome.windows.remove(windowId);
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
async function doDetailLinkGroups(
  context: ExecutionContext,
  taskId: string,
  searchs: Array<{ url: string; keyword: string }>,
  detailsMaxNum: number,
  windowId: number,
) {
  let detailLinkGroups = [] as Array<any>;
  let countDownLatch = new CountDownLatch(searchs.length);
  for (let i = 0; i < searchs.length; i++) {
    try {
      // script name & build search URL
      const { filename, url } = buildDeepSearchUrl(searchs[i].url, searchs[i].keyword);
      // open new Tab
      let tab = await chrome.tabs.create({
        url: url,
        windowId,
      });
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
      let eventId = taskId + '_' + i;
      // monitor Tab status
      tabsUpdateEvent.addListener(async function (obj: any) {
        if (obj.tabId != tab.id) {
          return;
        }
        if (obj.changeInfo.status === 'complete') {
          tabsUpdateEvent.removeListener(eventId);
          // inject js
          await injectScript(tab.id as number, filename);
          await sleep(1000);
          // crawler the search page details page
          // { links: [{ title, url }] }
          let detailLinks: any = await chrome.tabs.sendMessage(tab.id as number, {
            type: 'page:getDetailLinks',
            keyword: searchs[i].keyword,
          });
          if (!detailLinks || !detailLinks.links) {
            // TODO error
            detailLinks = { links: [] };
          }
          console.log('detailLinks: ', detailLinks);
          let links = detailLinks.links.slice(0, detailsMaxNum);
          detailLinkGroups.push({ url, links, filename });
          countDownLatch.countDown();
          chrome.tabs.remove(tab.id as number);
        } else if (obj.changeInfo.status === 'unloaded') {
          countDownLatch.countDown();
          chrome.tabs.remove(tab.id as number);
          tabsUpdateEvent.removeListener(eventId);
        }
      }, eventId);
    } catch (e) {
      console.error(e);
      countDownLatch.countDown();
    }
  }
  await countDownLatch.await(30_000);
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
async function doPageContent(
  context: ExecutionContext,
  taskId: string,
  detailLinkGroups: Array<any>,
  windowId: number,
) {
  const searchInfo: any = {
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
      let tab = await chrome.tabs.create({
        url: link.url,
        windowId,
      });
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
      searchInfo.running++;
      let eventId = taskId + '_' + i + '_' + j;

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Page load timeout')), 10000); // Timeout after 10 seconds
      });

      // Create a tab monitoring promise
      const monitorTabPromise = new Promise<void>(async (resolve, reject) => {
        tabsUpdateEvent.addListener(async function onTabUpdated(obj: any) {
          if (obj.tabId !== tab.id) return;

          if (obj.changeInfo.status === 'complete') {
            tabsUpdateEvent.removeListener(eventId);
            try {
              // Inject script and get page content
              await injectScript(tab.id as number, filename);
              await sleep(1000);

              let result: any = await chrome.tabs.sendMessage(tab.id as number, {
                type: 'page:getContent',
              });

              if (!result) throw new Error('No Result');

              link.content = result.content;
              link.page_title = result.title;
              searchInfo.succeed++;
              resolve(); // Resolve the promise if successful
            } catch (error) {
              searchInfo.failed++;
              searchInfo.failedLinks.push(link);
              reject(error); // Reject the promise on error
            } finally {
              searchInfo.running--;
              countDownLatch.countDown();
              chrome.tabs.remove(tab.id as number);
              tabsUpdateEvent.removeListener(eventId);
            }
          } else if (obj.changeInfo.status === 'unloaded') {
            searchInfo.running--;
            countDownLatch.countDown();
            chrome.tabs.remove(tab.id as number);
            tabsUpdateEvent.removeListener(eventId);
            reject(new Error('Tab unloaded')); // Reject if the tab is unloaded
          }
        }, eventId);
      });

      // Use Promise.race to enforce the timeout
      try {
        await Promise.race([monitorTabPromise, timeoutPromise]);
      } catch (e) {
        console.error(`${link.title} failed:`, e);
        searchInfo.running--;
        searchInfo.failed++;
        searchInfo.failedLinks.push(link);
        countDownLatch.countDown();
        chrome.tabs.remove(tab.id as number); // Clean up tab on failure
      }
    }
  }

  await countDownLatch.await(60_000);
  return searchInfo;
}