import { useCallback } from "react";
import { uuidv4 } from "@eko-ai/eko";
import type { UploadedFile } from "../types";

export const useFileUpload = () => {
  // Convert file to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // Upload file to server
  const uploadFile = useCallback(
    async (file: UploadedFile): Promise<{ fileId: string; url: string }> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          reject("Upload timeout");
        }, 180_000);

        const requestId = uuidv4();

        // Set up listener first
        const listener = (message: any) => {
          if (
            message.type === "uploadFile_result" &&
            message.requestId === requestId
          ) {
            clearTimeout(timer);
            chrome.runtime.onMessage.removeListener(listener);
            if (!message.data || message.data.error) {
              reject(new Error(message.data.error || "Upload failed"));
            } else {
              resolve(message.data);
            }
          }
        };
        chrome.runtime.onMessage.addListener(listener);

        // Send upload request
        chrome.runtime.sendMessage({
          requestId,
          type: "uploadFile",
          data: {
            base64Data: file.base64Data,
            mimeType: file.mimeType,
            filename: file.filename,
          },
        });
      });
    },
    []
  );

  return { fileToBase64, uploadFile };
};
