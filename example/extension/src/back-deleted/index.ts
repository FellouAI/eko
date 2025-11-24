import { config, Eko } from "@eko-ai/eko";
import { main } from "./main";

var eko: Eko;

chrome.storage.local.set({ running: false });

// Listen to messages from the browser extension
chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  if (request.type == "run") {
    try {
      // Click the RUN button to execute the main function (workflow)
      chrome.runtime.sendMessage({ type: "log", log: "Run..." });
      // Run workflow
      eko = await main(request.prompt);
    } catch (e) {
      console.error(e);
      chrome.runtime.sendMessage({
        type: "log",
        log: e + "",
        level: "error",
      });
    }
  } else if (request.type == "update_mode") {
    config.mode = request.mode
    config.markImageMode = request.markImageMode
  } else if (request.type == "stop") {
    eko && eko.getAllTaskId().forEach(taskId => {
      eko.abortTask(taskId);
      chrome.runtime.sendMessage({ type: "log", log: "Abort taskId: " + taskId });
    });
    chrome.runtime.sendMessage({ type: "log", log: "Stop" });
  }
});

(chrome as any).sidePanel && (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
