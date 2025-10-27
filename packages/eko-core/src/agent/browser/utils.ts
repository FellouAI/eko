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
      // Convert base64 to Blob
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
      });
      const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imageBitmap, 0, 0);

      const sortedEntries = Object.entries(area_map)
        .filter(([id, area]) => area.width > 0 && area.height > 0)
        .sort((a, b) => {
          const areaA = a[1].width * a[1].height;
          const areaB = b[1].width * b[1].height;
          return areaA - areaB;
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

        // Draw a border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(area.x, area.y, area.width, area.height);

        // Draw ID tag background
        const fontSize = Math.min(12, Math.max(8, area.height / 2));
        ctx.font = `${fontSize}px sans-serif`;
        const textMetrics = ctx.measureText(id);
        const padding = 4;
        const labelWidth = textMetrics.width + padding * 2;
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

      // Convert OffscreenCanvas to Blob, then to base64
      const resultBlob = await canvas.convertToBlob({
        type: screenshot.imageType,
      });

      const reader = new FileReader();
      reader.onloadend = () => {
        const resultBase64 = reader.result as string;
        resolve(resultBase64);
      };
      reader.onerror = () => {
        reject(new Error("Failed to convert blob to base64"));
      };
      reader.readAsDataURL(resultBlob);
    } catch (error) {
      reject(error);
    }
  });
}

export async function compress_image(
  imageBase64: string,
  imageType: "image/jpeg" | "image/png",
  compress:
    | { scale: number }
    | {
        resizeWidth: number;
        resizeHeight: number;
      },
  quality: number = 1
): Promise<{
  imageBase64: string;
  imageType: "image/jpeg" | "image/png";
}> {
  const base64Data = imageBase64;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: imageType });
  const bitmap = await createImageBitmap(blob);
  const width = (compress as any).scale
    ? bitmap.width * (compress as any).scale
    : (compress as any).resizeWidth;
  const height = (compress as any).scale
    ? bitmap.height * (compress as any).scale
    : (compress as any).resizeHeight;
  if (bitmap.width == width && bitmap.height == height && quality == 1) {
    return {
      imageBase64: imageBase64,
      imageType: imageType,
    };
  }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d") as any;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const resultBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: quality,
  });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      let imageDataUrl = reader.result as string;
      let imageBase64 = imageDataUrl.substring(
        imageDataUrl.indexOf("base64,") + 7
      );
      resolve({
        imageBase64: imageBase64,
        imageType: "image/jpeg",
      });
    };
    reader.readAsDataURL(resultBlob);
  });
}
