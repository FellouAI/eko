import { loadPackage } from "../../common/utils";

export function extract_page_content(params?: {
  root_selector?: string;
  root_element?: HTMLElement;
  max_url_length?: number;
  max_content_length?: number;
  min_image_area?: number;
  ignored_tags?: string[];
  key_attributes?: string[];
}): string {
  params = params || {};
  const IGNORED_TAGS = new Set(
    params.ignored_tags || ["script", "style", "noscript", "svg", "canvas"]
  );
  const FORM_TAGS = new Set(["input", "select", "textarea"]);
  const KEY_ATTRIBUTES = new Set(
    params.key_attributes || [
      "id",
      "title",
      "name",
      "alt",
      "src",
      "url",
      "href",
      "value",
      "checked",
      "selected",
    ]
  );
  const urlLimit = params.max_url_length || 200;
  const contentLimit = params.max_content_length || 50000;
  const minImageArea = params.min_image_area || 1600;

  const parts: string[] = [];
  let currentLength = 0;

  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
    };
    return text.replace(/[<>]/g, (m) => map[m] || m);
  };

  const getKeyAttributes = (element: HTMLElement): Record<string, string> => {
    const attrs: Record<string, string> = {};
    const attributes = element.attributes;

    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      const name = attr.name.toLowerCase();
      if (KEY_ATTRIBUTES.has(name)) {
        const value = attr.value?.trim();
        if (value) {
          attrs[name] = value;
        }
      }
    }

    if (element instanceof HTMLInputElement) {
      const inputType = element.type.toLowerCase();
      if (inputType === "checkbox" || inputType === "radio") {
        if (element.checked) {
          attrs.checked = "true";
        }
      }
      if (element.value && !attrs.value) {
        attrs.value = element.value;
      }
      if (element.name && !attrs.name) {
        attrs.name = element.name;
      }
      if (attrs.value || Object.keys(attrs).length > 0) {
        attrs.type = inputType;
      }
    } else if (element instanceof HTMLSelectElement) {
      if (element.selectedIndex >= 0) {
        const selectedOption = element.options[element.selectedIndex];
        if (selectedOption) {
          attrs.selected = String(element.selectedIndex);
          if (selectedOption.value && !attrs.value) {
            attrs.value = selectedOption.value;
          }
        }
      }
      if (element.name && !attrs.name) {
        attrs.name = element.name;
      }
    } else if (element instanceof HTMLTextAreaElement) {
      if (element.value && !attrs.value) {
        attrs.value = element.value;
      }
      if (element.name && !attrs.name) {
        attrs.name = element.name;
      }
    } else if (element instanceof HTMLImageElement) {
      const src =
        element.src ||
        element.getAttribute("src") ||
        element.getAttribute("data-src");
      if (src && !attrs.src) {
        attrs.src = src;
      }
      if (element.alt && !attrs.alt) {
        attrs.alt = element.alt;
      }
    } else if (element instanceof HTMLAnchorElement) {
      if (element.href && !attrs.href) {
        attrs.href = element.href;
      }
      if (element.title && !attrs.title) {
        attrs.title = element.title;
      }
    } else if (
      element instanceof HTMLVideoElement ||
      element instanceof HTMLAudioElement
    ) {
      const src = element.src || element.getAttribute("src");
      if (src && !attrs.src) {
        attrs.src = src;
      }
    }

    return attrs;
  };

  const buildAttributesString = (attrs: Record<string, string>): string => {
    if (Object.keys(attrs).length === 0) {
      return "";
    }
    const attrStrings: string[] = [];
    for (const [key, value] of Object.entries(attrs)) {
      if (value) {
        attrStrings.push(`${key}="${escapeHtml(value)}"`);
      }
    }
    return attrStrings.length > 0 ? " " + attrStrings.join(" ") : "";
  };

  const hasKeyAttributes = (attrs: Record<string, string>): boolean => {
    return Object.keys(attrs).length > 0;
  };

  const addHtmlContent = (content: string): boolean => {
    if (!content || currentLength >= contentLimit) {
      return false;
    }
    const contentLength = content.length;
    if (currentLength + contentLength > contentLimit) {
      const remaining = contentLimit - currentLength;
      if (remaining > 0) {
        parts.push(content.slice(0, remaining));
      }
      return false;
    }
    currentLength += contentLength;
    parts.push(content);
    return true;
  };

  const hasDirectTextChild = (node: Node): boolean => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || "";
        if (text.trim()) {
          return true;
        }
      }
    }
    return false;
  };

  const traverse = (node: Node): string => {
    if (currentLength >= contentLimit) {
      return "";
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const trimmed = text.trim();
      if (trimmed) {
        return escapeHtml(trimmed);
      }
      return "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (IGNORED_TAGS.has(tagName)) {
      return "";
    }

    try {
      const style = window.getComputedStyle(element);
      if (style.display === "none") {
        return "";
      }
    } catch (e) {}

    const attrs = getKeyAttributes(element);
    const attrsString = buildAttributesString(attrs);
    const hasKeyAttrs = hasKeyAttributes(attrs);
    const hasDirectText = hasDirectTextChild(node);

    if (FORM_TAGS.has(tagName)) {
      let value = "";
      if (tagName === "input") {
        const input = element as HTMLInputElement;
        const inputType = input.type.toLowerCase();
        if (inputType === "checkbox" || inputType === "radio") {
          if (!input.checked) {
            return "";
          }
          value = input.value || String(input.checked);
        } else if (inputType === "password") {
          return "";
        } else {
          value = input.value || "";
        }
      } else if (tagName === "select") {
        const select = element as HTMLSelectElement;
        if (select.selectedIndex >= 0) {
          const selectedOption = select.options[select.selectedIndex];
          value = selectedOption
            ? selectedOption.text || selectedOption.value
            : "";
        }
      } else if (tagName === "textarea") {
        value = (element as HTMLTextAreaElement).value || "";
      }

      if (value || hasKeyAttrs || tagName === "textarea") {
        const escapedValue = escapeHtml(value);
        return `<${tagName}${attrsString}>${escapedValue}</${tagName}>`;
      }
      return "";
    }

    if (tagName === "img") {
      const img = element as HTMLImageElement;
      const src =
        img.src || img.getAttribute("src") || img.getAttribute("data-src");

      if (
        src &&
        src.length <= urlLimit &&
        img.width * img.height >= minImageArea &&
        src.startsWith("http")
      ) {
        if (!attrs.alt && (img.alt || img.title)) {
          attrs.alt = img.alt || img.title || "";
        }
        if (!attrs.src) {
          attrs.src = src.trim();
        }
        const imgAttrsString = buildAttributesString(attrs);
        return `<img${imgAttrsString} />`;
      }
      return "";
    }

    if (tagName === "a") {
      const anchor = element as HTMLAnchorElement;
      const href = anchor.href || anchor.getAttribute("href");

      const childContent: string[] = [];
      for (const child of node.childNodes) {
        const content = traverse(child);
        if (content) {
          childContent.push(content);
        }
      }
      const innerContent = childContent.join("");

      if (!innerContent && !hasKeyAttrs) {
        return "";
      }

      if (href && href.length <= urlLimit && href.startsWith("http")) {
        if (!attrs.href) {
          attrs.href = href.trim();
        }
        const linkAttrsString = buildAttributesString(attrs);
        return `<a${linkAttrsString}>${innerContent}</a>`;
      } else if (hasKeyAttrs || hasDirectText) {
        return `<a${attrsString}>${innerContent}</a>`;
      }

      return innerContent;
    }

    if (tagName === "video" || tagName === "audio") {
      const media = element as HTMLVideoElement | HTMLAudioElement;
      let src = media.src || media.getAttribute("src");
      const sources = element.querySelectorAll("source");

      if (sources.length > 0 && sources[0].src) {
        src = sources[0].src;
      }

      if (src && src.startsWith("http") && src.length <= urlLimit) {
        if (!attrs.src) {
          attrs.src = src.trim();
        }
        const mediaAttrsString = buildAttributesString(attrs);
        return `<${tagName}${mediaAttrsString}></${tagName}>`;
      }
      return "";
    }

    const childContent: string[] = [];
    for (const child of node.childNodes) {
      const content = traverse(child);
      if (content) {
        childContent.push(content);
      }
    }
    const innerContent = childContent.join("");

    if (!innerContent) {
      return "";
    }

    if (hasKeyAttrs || hasDirectText) {
      return `<${tagName}${attrsString}>${innerContent}</${tagName}>`;
    }

    return innerContent;
  };

  if (!params.root_element) {
    if (params.root_selector) {
      params.root_element = document.querySelector(
        params.root_selector
      ) as HTMLElement;
      if (!params.root_element) {
        return "";
      }
    } else {
      params.root_element = document.body;
    }
  }

  const rootTabName = params.root_element.tagName.toLowerCase();

  try {
    if (params.root_element) {
      const content = traverse(params.root_element);
      if (content) {
        addHtmlContent(content);
      }
    }
  } catch (e) {
    try {
      const fallbackText = params.root_element.innerText || "";
      if (fallbackText) {
        const escaped = escapeHtml(fallbackText);
        const truncated =
          escaped.length > contentLimit
            ? Array.from(escaped).slice(0, contentLimit).join("").trim() + "..."
            : escaped;
        return truncated.startsWith(`<${rootTabName}`)
          ? truncated
          : `<${rootTabName}>${truncated}</${rootTabName}>`;
      }
      return "";
    } catch {
      return "";
    }
  }

  let result = parts.join("");
  if (result.length > contentLimit) {
    result = Array.from(result).slice(0, contentLimit).join("").trim() + "...";
  }

  return result.startsWith(`<${rootTabName}`)
    ? result
    : `<${rootTabName}>${result}</${rootTabName}>`;
}

export function mark_screenshot_highlight_elements(
  screenshot: {
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
  },
  area_map: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >,
  client_rect: { width: number; height: number }
): Promise<string> {
  return new Promise<string>(async (resolve, reject) => {
    try {
      const hasOffscreen = typeof OffscreenCanvas !== "undefined";
      const hasCreateImageBitmap = typeof createImageBitmap !== "undefined";
      const hasDOM =
        typeof document !== "undefined" && typeof Image !== "undefined";
      const isNode =
        typeof window === "undefined" &&
        // @ts-ignore
        typeof process !== "undefined" &&
        // @ts-ignore
        !!process.versions &&
        // @ts-ignore
        !!process.versions.node;

      const loadImageAny = async () => {
        if (hasCreateImageBitmap) {
          const base64Data = screenshot.imageBase64;
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: screenshot.imageType });
          const imageBitmap = await createImageBitmap(blob, {
            resizeQuality: "high",
            resizeWidth: client_rect.width,
            resizeHeight: client_rect.height,
          } as any);
          return { img: imageBitmap };
        }
        if (hasDOM) {
          const img = await new Promise<HTMLImageElement>(
            (resolveImg, rejectImg) => {
              const image = new Image();
              image.onload = () => resolveImg(image);
              image.onerror = (e) => rejectImg(e);
              image.src = `data:${screenshot.imageType};base64,${screenshot.imageBase64}`;
            }
          );
          return { img };
        }
        if (isNode) {
          const canvasMod = await loadPackage("canvas");
          const { loadImage } = canvasMod as any;
          const dataUrl = `data:${screenshot.imageType};base64,${screenshot.imageBase64}`;
          const img = await loadImage(dataUrl);
          return { img };
        }
        throw new Error("No image environment available");
      };

      const createCanvasAny = async (width: number, height: number) => {
        if (hasOffscreen) {
          const canvas = new OffscreenCanvas(width, height) as any;
          return {
            ctx: canvas.getContext("2d") as any,
            exportDataUrl: async (mime: string) => {
              const blob = await canvas.convertToBlob({ type: mime });
              return await new Promise<string>((res, rej) => {
                const reader = new FileReader();
                reader.onloadend = () => res(reader.result as string);
                reader.onerror = () =>
                  rej(new Error("Failed to convert blob to base64"));
                reader.readAsDataURL(blob);
              });
            },
          };
        }
        if (hasDOM) {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          return {
            ctx: canvas.getContext("2d") as any,
            exportDataUrl: async (mime: string) => canvas.toDataURL(mime),
          };
        }
        if (isNode) {
          const canvasMod = await loadPackage("canvas");
          const { createCanvas } = canvasMod as any;
          const canvas = createCanvas(width, height);
          return {
            ctx: canvas.getContext("2d"),
            exportDataUrl: async (mime: string) => canvas.toDataURL(mime),
          };
        }
        throw new Error("No canvas environment available");
      };

      const loaded = await loadImageAny();
      const targetWidth = client_rect.width;
      const targetHeight = client_rect.height;
      const { ctx, exportDataUrl } = await createCanvasAny(
        targetWidth,
        targetHeight
      );
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(loaded.img, 0, 0, targetWidth, targetHeight);

      const sortedEntries = Object.entries(area_map)
        .filter(([id, area]) => area.width > 0 && area.height > 0)
        .sort((a, b) => {
          const areaA = a[1].width * a[1].height;
          const areaB = b[1].width * b[1].height;
          return areaB - areaA;
        });

      const colors = [
        "#FF0000",
        "#00FF00",
        "#0000FF",
        "#FFA500",
        "#800080",
        "#008080",
        "#FF69B4",
        "#4B0082",
        "#FF4500",
        "#2E8B57",
        "#DC143C",
        "#4682B4",
      ];
      sortedEntries.forEach(([id, area], index) => {
        const color = colors[index % colors.length];
        if (area.width * area.height < 40000) {
          // Draw a background color
          ctx.fillStyle = color + "1A";
          ctx.fillRect(area.x, area.y, area.width, area.height);
        }

        // Draw a border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(area.x, area.y, area.width, area.height);

        // Draw ID tag background
        const fontSize = Math.min(12, Math.max(8, area.height / 2));
        ctx.font = `${fontSize}px sans-serif`;
        const metrics: any = ctx.measureText(id) as any;
        const textWidth = metrics && metrics.width ? metrics.width : 0;
        const padding = 4;
        const labelWidth = textWidth + padding * 2;
        const labelHeight = fontSize + padding * 2;

        // The tag position is in the upper right corner.
        const labelX = area.x + area.width - labelWidth;
        let labelY = area.y;

        // Adjust if box is too small
        if (area.width < labelWidth + 4 || area.height < labelHeight + 4) {
          // Position outside the box if it's too small
          labelY = area.y - labelHeight;
        }

        // Draw label background
        ctx.fillStyle = color;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

        // Draw ID text
        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "top";
        ctx.fillText(id, labelX + padding, labelY + padding);
      });

      // Export the image
      const out = await exportDataUrl(screenshot.imageType);
      resolve(out);
    } catch (error) {
      reject(error);
    }
  });
}
