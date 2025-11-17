import { loadPackage } from "../../common/utils";

export function extract_page_content(
  max_url_length = 200,
  max_content_length = 50000
) {
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
  result = result.replace(/\s*\n/g, "\n").replace(/\n+/g, "\n").trim();
  if (result.length > max_content_length) {
    // result = result.slice(0, max_content_length) + "...";
    result = Array.from(result).slice(0, max_content_length).join("") + "...";
  }
  return result;
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
      const hasDOM = typeof document !== "undefined" && typeof Image !== "undefined";
      // @ts-ignore
      const isNode = typeof window === "undefined" && typeof process !== "undefined" && !!process.versions && !!process.versions.node;

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
