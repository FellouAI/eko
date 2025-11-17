import React from "react";
import App from "./App.tsx";
import ReactDOM from "react-dom/client";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Login automation testing - lazy load to avoid build-time execution
if (typeof window !== "undefined") {
  setTimeout(async () => {
    const { auto_test_case } = await import("./main.ts");
    await auto_test_case();
  }, 500);
}
