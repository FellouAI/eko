# AI Development Rules – Chrome Extension Template

This document outlines the technology stack and usage guidelines for this Chrome extension template. Following these rules will maintain consistency, improve collaboration, and ensure the AI assistant can effectively understand, modify, and extend the codebase.

## Tech Stack Overview

The extension is built using the following core technologies:

- Framework: None (Vanilla JavaScript, HTML, and CSS)  
- Language: JavaScript (ES6+)  
- Styling: CSS (optionally with simple CSS variables, no preprocessors)  
- Manifest: Chrome Manifest V3  
- APIs: Chrome Extension APIs (chrome.runtime, chrome.scripting, chrome.storage, etc.)  
- Optional Pages: Popup, Options, or background scripts as needed

## Library Usage Guidelines

To maintain simplicity and ensure clarity for AI assistance, follow these rules:

1. Core Extension Files  
- manifest.json: Must follow Manifest V3 syntax. Include only necessary permissions.  
- background.js / service_worker.js: For background tasks or event handling.  
- content.js: For scripts injected into web pages.  
- popup.html / popup.js: Optional; only if the extension includes a popup.  
- options.html / options.js: Optional; only if the extension has a settings page.  
- styles.css: Optional; minimal styling for popup or options page.  
Avoid generating unnecessary files or directories.

2. JavaScript Guidelines  
- Use vanilla ES6+ JavaScript.  
- Avoid using React, Vue, Angular, or any UI frameworks.  
- Keep functions modular and well-commented.  
- Use async/await for asynchronous operations.  
- Avoid external libraries unless absolutely necessary; prioritize native APIs.

3. CSS Guidelines  
- Keep styling minimal and scoped to popup/options pages.  
- Prefer CSS classes over inline styles for maintainability.  
- Avoid CSS frameworks (Tailwind, Bootstrap, etc.).  
- Global CSS variables can be used in styles.css.

4. Chrome API Usage  
- Prefer the chrome.scripting API over deprecated methods.  
- Use chrome.storage for persistent storage instead of localStorage.  
- Avoid requesting more permissions than necessary.

5. Folder Structure  
Recommended minimal structure:

/extension-name  
  ├─ manifest.json  
  ├─ background.js  
  ├─ content.js  
  ├─ popup.html (optional)  
  ├─ popup.js (optional)  
  ├─ options.html (optional)  
  ├─ options.js (optional)  
  ├─ styles.css (optional)  
  ├─ VERSIONS.md

- Only include optional files if features require them.  
- VERSIONS.md is mandatory. It should record all file changes, updates, and version history for the template.  
- No build or bundling scripts unless explicitly needed.

6. Version Tracking – VERSIONS.md  
- Purpose: Keep a chronological record of all changes in the template.  
- Format: Use clear entries with date, file modified, change description, and version number. Example:

# Version History

## v1.0.0 – 2025-08-24  
- Created manifest.json with minimal permissions  
- Added background.js with basic event listener  
- Added content.js placeholder  

## v1.1.0 – 2025-08-25  
- Added popup.html and popup.js with minimal UI  
- Updated manifest.json to include popup

- AI should update this file automatically whenever changes are made to any template file.  
- AI should check this file before making changes to understand the current version and avoid conflicts.

7. Best Practices  
- Keep code modular and reusable.  
- Comment all significant logic for clarity.  
- Avoid hardcoding values; use constants or configuration objects.  
- Test extension in Developer Mode in Chrome before distribution.  
- Avoid unnecessary network requests; keep scripts efficient.

8. Output for AI  
- Return all files as code blocks labeled with the filename.  
- Avoid generating ZIPs, node_modules, or build files.  
- Do not include React, JSX, or other framework-related code.  
- Always update VERSIONS.md with each change.