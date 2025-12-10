import React, {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Typography } from "antd";
import { uuidv4 } from "@eko-ai/eko";
import type { PageTab } from "@eko-ai/eko/types";
import { GlobalOutlined } from "@ant-design/icons";

interface WebpageMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onSend: () => void;
}

const { Text } = Typography;

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatValueForDisplay = (value: string) => {
  if (!value) return "";
  const container = document.createElement("div");
  container.innerHTML = value;
  container.querySelectorAll(".webpage-reference").forEach((el) => {
    const displaySpan = document.createElement("span");
    displaySpan.setAttribute("class", "webpage-reference-display");
    displaySpan.setAttribute("contenteditable", "false");
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name === "class") return;
      displaySpan.setAttribute(attr.name, attr.value);
    });
    displaySpan.textContent = el.textContent || "";
    el.replaceWith(displaySpan);
  });
  return container.innerHTML.replace(/\n/g, "<br/>");
};

const htmlToPlainText = (html: string) => {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll(".webpage-reference-display").forEach((el) => {
    const title = el.textContent || "";
    const displayText = title.startsWith("@") ? title : `@${title}`;
    el.replaceWith(displayText);
  });
  container.querySelectorAll(".webpage-reference").forEach((el) => {
    const title = el.textContent || "";
    el.replaceWith(`@${title}`);
  });
  return container.innerText.replace(/\u00A0/g, " ");
};

const htmlToValue = (html: string) => {
  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll(".webpage-reference-display").forEach((el) => {
    const span = document.createElement("span");
    span.setAttribute("class", "webpage-reference");
    const tabId = el.getAttribute("tab-id") || "";
    const url = el.getAttribute("url") || "";
    if (tabId) {
      span.setAttribute("tab-id", tabId);
    }
    if (url) {
      span.setAttribute("url", url);
    }
    const textContent = (el.textContent || "").replace(/^@/, "");
    span.textContent = textContent;
    el.replaceWith(span);
  });

  const placeholders: string[] = [];
  container.querySelectorAll(".webpage-reference").forEach((el, index) => {
    const token = `__WEB_REF_${index}__`;
    placeholders.push(el.outerHTML);
    el.replaceWith(token);
  });

  let plainText = container.innerText.replace(/\u00A0/g, " ");

  placeholders.forEach((markup, index) => {
    plainText = plainText.replace(`__WEB_REF_${index}__`, markup);
  });

  return plainText.trim();
};

const getHtmlToCaret = (editor: HTMLDivElement | null) => {
  if (!editor) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.endContainer)) return null;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(range.endContainer, range.endOffset);
  const div = document.createElement("div");
  div.appendChild(preRange.cloneContents());
  return div.innerHTML;
};

const ensureSpaceAfterElement = (element: HTMLElement) => {
  const parent = element.parentNode;
  if (!parent) return;
  const nextNode = element.nextSibling;
  if (!nextNode) {
    parent.appendChild(document.createTextNode(" "));
    return;
  }
  if (nextNode.nodeType === Node.TEXT_NODE) {
    const textNode = nextNode as Text;
    if (!textNode.textContent?.startsWith(" ")) {
      textNode.insertData(0, " ");
    }
  } else {
    parent.insertBefore(document.createTextNode(" "), nextNode);
  }
};

export const WebpageMentionInput: React.FC<WebpageMentionInputProps> = ({
  value,
  onChange,
  disabled,
  onSend,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<PageTab[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [atPosition, setAtPosition] = useState<number | null>(null);
  const [mentionQueryLength, setMentionQueryLength] = useState(0);
  const [mentionQuery, setMentionQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const pendingFocusRefId = useRef<string | null>(null);
  const skipSyncRef = useRef(false);
  const isComposingRef = useRef(false);

  const resetMentionState = useCallback(() => {
    setShowDropdown(false);
    setAtPosition(null);
    setMentionQuery("");
    setMentionQueryLength(0);
    setHighlightedIndex(0);
  }, []);

  const getTabs = useCallback(async () => {
    setLoadingTabs(true);
    return new Promise<PageTab[]>((resolve, reject) => {
      const requestId = uuidv4();
      const timer = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("Get tabs timeout"));
      }, 10000);

      const listener = (message: any) => {
        if (
          message.type === "getTabs_result" &&
          message.requestId === requestId
        ) {
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          if (message.data.error) {
            reject(new Error(message.data.error));
          } else {
            resolve(message.data.tabs || []);
          }
        }
      };
      chrome.runtime.onMessage.addListener(listener);

      chrome.runtime.sendMessage({
        requestId,
        type: "getTabs",
        data: {},
      });
    });
  }, []);

  const displayHtml = useMemo(() => formatValueForDisplay(value), [value]);

  const filteredTabs = useMemo(() => {
    const query = mentionQuery.trim().toLowerCase();
    const list = query
      ? tabs.filter((tab) => {
          const title = tab.title?.toLowerCase() || "";
          const url = tab.url?.toLowerCase() || "";
          return title.includes(query) || url.includes(query);
        })
      : tabs;
    return list;
  }, [mentionQuery, tabs]);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== displayHtml) {
      editor.innerHTML = displayHtml || "";
    }

    if (pendingFocusRefId.current) {
      const target = editor.querySelector<HTMLElement>(
        `[tab-id="${pendingFocusRefId.current}"]`
      );
      if (target) {
        editor.focus();
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          let nextNode: Node | null = target.nextSibling;
          if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
            const textNode = nextNode as Text;
            if (textNode.textContent && textNode.textContent.startsWith(" ")) {
              range.setStart(textNode, 1);
              range.collapse(true);
            } else {
              range.setStartAfter(target);
              range.collapse(true);
              ensureSpaceAfterElement(target);
              const newNode = target.nextSibling;
              if (newNode && newNode.nodeType === Node.TEXT_NODE) {
                range.setStart(newNode, 1);
                range.collapse(true);
              }
            }
          } else {
            ensureSpaceAfterElement(target);
            const inserted = target.nextSibling;
            if (inserted && inserted.nodeType === Node.TEXT_NODE) {
              range.setStart(inserted, 1);
            } else {
              range.setStartAfter(target);
            }
            range.collapse(true);
          }
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      pendingFocusRefId.current = null;
    }
  }, [displayHtml]);

  const updateMentionState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      resetMentionState();
      return;
    }
    const htmlToCaret = getHtmlToCaret(editor);
    if (htmlToCaret == null) {
      resetMentionState();
      return;
    }
    const plainBefore = htmlToPlainText(htmlToCaret);
    const lastAtIndex = plainBefore.lastIndexOf("@");
    if (lastAtIndex === -1) {
      resetMentionState();
      return;
    }
    const textAfterAt = plainBefore.substring(lastAtIndex + 1);
    if (textAfterAt.includes(" ") || textAfterAt.includes("\n")) {
      resetMentionState();
      return;
    }
    const rawFragment = htmlToValue(htmlToCaret);
    const atIndexInRaw = rawFragment.lastIndexOf("@");
    if (atIndexInRaw === -1) {
      resetMentionState();
      return;
    }

    setAtPosition(atIndexInRaw);
    setMentionQueryLength(textAfterAt.length);
    setMentionQuery(textAfterAt);

    if (!showDropdown) {
      setShowDropdown(true);
      setLoadingTabs(true);
      getTabs()
        .then((fetched) => {
          setTabs(fetched);
          setLoadingTabs(false);
        })
        .catch((error) => {
          console.error("Error getting tabs:", error);
          setLoadingTabs(false);
        });
    }
  }, [getTabs, resetMentionState, showDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const editor = editorRef.current;
      const dropdown = document.querySelector("[data-tab-dropdown]");
      if (
        showDropdown &&
        editor &&
        !editor.contains(e.target as Node) &&
        dropdown &&
        !dropdown.contains(e.target as Node)
      ) {
        resetMentionState();
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [resetMentionState, showDropdown]);

  useEffect(() => {
    if (!showDropdown) return;
    if (filteredTabs.length === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex((prev) => {
      if (prev < 0 || prev >= filteredTabs.length) {
        return 0;
      }
      return prev;
    });
  }, [filteredTabs, showDropdown]);

  useEffect(() => {
    if (!showDropdown) return;
    if (highlightedIndex < 0) return;
    const container = tabListRef.current;
    if (!container) return;
    const option = container.querySelector<HTMLElement>(
      `[data-tab-option-index="${highlightedIndex}"]`
    );
    option?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, showDropdown]);

  const insertWebpageReference = useCallback(
    (tab: PageTab) => {
      if (atPosition === null) return;

      const beforeAt = value.substring(0, atPosition);
      const afterAtStart = atPosition + 1 + mentionQueryLength;
      const afterAt = value.substring(afterAtStart);
      const reference = `<span class="webpage-reference" tab-id="${
        tab.tabId
      }" url="${escapeHtml(tab.url)}">${escapeHtml(tab.title)}</span>`;
      const newValue = `${beforeAt}${reference} ${afterAt}`;

      onChange(newValue);
      resetMentionState();
      pendingFocusRefId.current = tab.tabId;

      setTimeout(() => {
        editorRef.current?.focus();
      }, 0);
    },
    [atPosition, mentionQueryLength, onChange, resetMentionState, value]
  );

  const handleEditorInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const newValue = htmlToValue(editor.innerHTML);
    onChange(newValue);
    updateMentionState();
    skipSyncRef.current = true;
  }, [onChange, updateMentionState]);

  const handleEditorPaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") || "";
      document.execCommand("insertText", false, text);
    },
    []
  );

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (showDropdown) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (filteredTabs.length > 0) {
            setHighlightedIndex((prev) => {
              if (prev < 0) return 0;
              return (prev + 1) % filteredTabs.length;
            });
          }
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (filteredTabs.length > 0) {
            setHighlightedIndex((prev) => {
              if (prev <= 0) return filteredTabs.length - 1;
              return prev - 1;
            });
          }
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && !isComposingRef.current) {
          event.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filteredTabs.length) {
            insertWebpageReference(filteredTabs[highlightedIndex]);
            return;
          }
        }
      }

      if (event.key === "Enter" && !event.shiftKey && !showDropdown && !isComposingRef.current) {
        event.preventDefault();
        onSend();
      } else if (event.key === "Escape" && showDropdown) {
        resetMentionState();
      }
    },
    [
      disabled,
      filteredTabs,
      highlightedIndex,
      insertWebpageReference,
      onSend,
      resetMentionState,
      showDropdown,
    ]
  );

  const handleEditorClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target && target.classList.contains("webpage-reference-display")) {
        const url = target.getAttribute("url");
        if (url) {
          chrome.tabs
            ? chrome.tabs.create({ url })
            : window.open(url, "_blank", "noopener");
        }
      }
      updateMentionState();
    },
    [updateMentionState]
  );

  return (
    <div className="chat-input-rich-container">
      <div
        ref={editorRef}
        className="chat-input-editor"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder="Type a message..."
        onInput={handleEditorInput}
        onKeyDown={handleEditorKeyDown}
        onKeyUp={updateMentionState}
        onMouseUp={updateMentionState}
        onClick={handleEditorClick}
        onPaste={handleEditorPaste}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
      />
      {showDropdown && (
        <div
          data-tab-dropdown
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            marginBottom: 4,
            backgroundColor: "#ffffff",
            border: "1px solid #d9d9d9",
            borderRadius: 4,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 1000,
          }}
        >
          {loadingTabs ? (
            <div style={{ padding: 12, textAlign: "center" }}>
              <Text type="secondary">Loading...</Text>
            </div>
          ) : filteredTabs.length === 0 ? (
            <div style={{ padding: 12, textAlign: "center" }}>
              <Text type="secondary">No tabs found</Text>
            </div>
          ) : (
            <div
              ref={tabListRef}
              style={{
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {filteredTabs.map((tab, index) => {
                const isActive = index === highlightedIndex;
                return (
                  <div
                    key={tab.tabId || index}
                    style={{
                      cursor: "pointer",
                      padding: "8px 12px",
                      backgroundColor: isActive ? "#e6f4ff" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertWebpageReference(tab);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    data-tab-option-index={index}
                  >
                    {tab.favicon ? (
                      <img
                        src={tab.favicon}
                        alt="icon"
                        style={{
                          width: "1em",
                          height: "1em",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      <GlobalOutlined />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        strong
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tab.title}
                      </Text>
                      <Text
                        type="secondary"
                        style={{
                          display: "block",
                          fontSize: 12,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tab.url}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
