// popup.js
const pingBtn = document.getElementById("pingBtn");
const responseEl = document.getElementById("response");

pingBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "ping" }, (response) => {
    responseEl.textContent = response.response;
  });
});