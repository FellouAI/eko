import React from "react";
import App from "./App";
import ReactDOM from "react-dom/client";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Auto start agent workflow - lazy load to avoid build-time execution
if (typeof window !== "undefined") {
  setTimeout(async () => {
    const { auto_outreach_case } = await import("./main");
    await auto_outreach_case();
  }, 500);
}

