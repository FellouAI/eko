// background.js
// Listens for messages or extension events

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed and ready.");
});

// Example message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "ping") {
    sendResponse({ response: "pong" });
  }
});