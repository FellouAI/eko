import { BrowserService } from "@eko-ai/eko";
import { PageTab, PageContent } from "@eko-ai/eko/types";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.js");

export class SimpleBrowserService implements BrowserService {
  async loadTabs(
    chatId: string,
    tabIds?: string[] | undefined
  ): Promise<PageTab[]> {
    let tabs = await chrome.tabs.query({});
    if (tabIds) {
      tabs = tabs.filter((tab) => tabIds.includes(String(tab.id)));
    }
    const sortedTabs = tabs
      .sort((a, b) => {
        const aTime = (a as any).lastAccessed || 0;
        const bTime = (b as any).lastAccessed || 0;
        return bTime - aTime;
      })
      .filter((tab) => !tab.url.startsWith("chrome://"))
      .map((tab) => {
        const lastAccessed = (tab as any).lastAccessed;
        const pageTab: PageTab = {
          tabId: String(tab.id),
          windowId: String(tab.windowId),
          title: tab.title || "",
          url: tab.url || "",
          active: tab.active,
          status: tab.status as "unloaded" | "loading" | "complete",
          favicon: tab.favIconUrl,
          lastAccessed: lastAccessed
            ? new Date(lastAccessed).toLocaleString()
            : undefined,
        };
        return pageTab;
      })
      .slice(0, 15);
    return Promise.resolve(sortedTabs);
  }

  async extractPageContents(
    chatId: string,
    tabIds: string[]
  ): Promise<PageContent[]> {
    const contents: PageContent[] = [];
    for (const tabId of tabIds) {
      const tab = await chrome.tabs.get(Number(tabId));
      const frameResults = await chrome.scripting.executeScript({
        target: { tabId: Number(tabId) },
        func: extractPageContent,
        args: [],
      });
      let tabHtmls = frameResults[0].result as string;
      if (!tabHtmls) {
        tabHtmls = await this.extractPdfContent(tab.url);
      }
      contents.push({
        tabId: tabId,
        url: tab.url,
        title: tab.title,
        content: tabHtmls,
      });
    }
    return Promise.resolve(contents);
  }

  private async extractPdfContent(pdfUrl: string): Promise<string> {
    try {
      const loadingTask = getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      let textContent = "";

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textData = await page.getTextContent();
        const pageText = textData.items.map((item: any) => item.str).join(" ");
        textContent += `PDF Page ${pageNum}:\n${pageText}\n\n`;
      }

      return textContent;
    } catch (error) {
      console.warn("Unable to load PDF:", error);
      return "";
    }
  }
}

function extractPageContent(max_url_length = 200) {
  let result = "";
  max_url_length = max_url_length || 200;
  try {
    function traverse(node: any) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        if (["script", "style", "noscript"].includes(tagName)) {
          return;
        }
        const style = window.getComputedStyle(node);
        if (
          style.display == "none" ||
          style.visibility == "hidden" ||
          style.opacity == "0"
        ) {
          return;
        }
      }
      if (node.nodeType === Node.TEXT_NODE) {
        // text
        const text = node.textContent.trim();
        if (text) {
          result += text + " ";
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        if (["input", "select", "textarea"].includes(tagName)) {
          // input / select / textarea
          if (tagName == "input" && node.type == "checkbox") {
            result += node.checked + " ";
          } else if (tagName == "input" && node.type == "radio") {
            if (node.checked && node.value) {
              result += node.value + " ";
            }
          } else if (node.value) {
            result += node.value + " ";
          }
        } else if (tagName === "img") {
          // image
          const src =
            node.src ||
            node.getAttribute("src") ||
            node.getAttribute("data-src");
          const alt = node.alt || node.title || "";
          if (
            src &&
            src.length <= max_url_length &&
            node.width * node.height >= 10000 &&
            src.startsWith("http")
          ) {
            result += `![${alt ? alt : "image"}](${src.trim()}) `;
          }
        } else if (tagName === "a" && node.children.length == 0) {
          // link
          const href = node.href || node.getAttribute("href");
          const text = node.innerText.trim() || node.title;
          if (
            text &&
            href &&
            href.length <= max_url_length &&
            href.startsWith("http")
          ) {
            result += `[${text}](${href.trim()}) `;
          } else {
            result += text + " ";
          }
        } else if (tagName === "video" || tagName == "audio") {
          // video / audio
          let src = node.src || node.getAttribute("src");
          const sources = node.querySelectorAll("source");
          if (sources.length > 0 && sources[0].src) {
            src = sources[0].src;
            if (src && src.startsWith("http") && sources[0].type) {
              result += sources[0].type + " ";
            }
          }
          if (src && src.startsWith("http")) {
            result += src.trim() + " ";
          }
        } else if (tagName === "br") {
          // br
          result += "\n";
        } else if (
          ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)
        ) {
          // block
          result += "\n";
          for (let child of node.childNodes) {
            traverse(child);
          }
          result += "\n";
          return;
        } else if (tagName === "hr") {
          // hr
          result += "\n--------\n";
        } else {
          // recursive
          for (let child of node.childNodes) {
            traverse(child);
          }
        }
      }
    }

    traverse(document.body);
  } catch (e) {
    result = document.body.innerText;
  }
  return result.replace(/\s*\n/g, "\n").replace(/\n+/g, "\n").trim();
}
