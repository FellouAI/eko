# Custom Agent Example - OutReach Agent Demo

This example demonstrates a multi-agent workflow combining BrowserAgent and a custom OutReach Agent to automatically screen profiles and send personalized cold emails.

## Overview

The application consists of:

1. **WebApp UI**: A Twitter-like interface displaying profile cards
   - Click on any profile card to view detailed information (name, email, domain, bio)
   - Modern, responsive design with smooth animations

2. **BrowserAgent**: Automatically browses the profile network
   - Navigates the page
   - Clicks on profile cards
   - Extracts profile information (name, email, domain, bio)

3. **OutReach Agent**: Custom agent for email outreach
   - Analyzes extracted profiles
   - Filters profiles based on criteria
   - Composes personalized cold emails
   - Sends emails using the Email Tool

4. **Email Tool**: Placeholder tool for sending emails
   - Validates email addresses
   - Logs email details (in production, would integrate with email service)
   - Tracks sent emails in context variables

## Project Structure

```
custom_agent/
├── public/
│   ├── index.html
│   └── manifest.json
├── src/
│   ├── agents/
│   │   └── OutReachAgent.ts      # Custom OutReach Agent (uses MCP tools)
│   ├── App.tsx                   # Main React component
│   ├── App.css                   # Styles for the UI
│   ├── index.tsx                 # React entry point
│   ├── index.css                 # Global styles
│   └── main.ts                   # Eko workflow setup with MCP client
├── package.json
└── README.md
```

## Setup

1. Install dependencies:
```bash
cd example/custom_agent
pnpm install
```

2. Run the application:
```bash
pnpm start
```

3. Configure API Key and MCP Settings (via Browser Console):
   - After the app starts, open browser DevTools (F12 or Cmd+Option+I)
   - In the console, set the following localStorage values:
   ```javascript
   // Set OpenRouter API Key
   localStorage.setItem("openrouter_api_key", "your-actual-api-key");
   
   // Set MCP Token (if authentication is required)
   localStorage.setItem("id_token", "your-mcp-token");
   
   // Set MCP Server URL (optional, default: http://localhost:8000)
   localStorage.setItem("mcp_base_url", "http://localhost:8000");
   ```
   - **Important**: Refresh the page after setting these values for them to take effect.

4. Configure Email Tool UUID:
   - Edit `src/main.ts` in the `createOutReachAgent` call
   - Replace the placeholder with actual email tool UUID from your MCP server:
   ```typescript
   const outreachAgent = createOutReachAgent([
     "your-email-tool-uuid-here" // Replace with actual UUID
   ]);
   ```

The app will open at `http://localhost:3000` and automatically start the agent workflow after you configure the API key and MCP settings in the browser console.

## How It Works

### Workflow Steps

1. **Profile Extraction (BrowserAgent)**:
   - BrowserAgent navigates the page
   - Clicks on each profile card to view details
   - Extracts profile information (name, email, domain, bio)
   - Stores data in context variables

2. **Profile Analysis (OutReachAgent)**:
   - Reads extracted profile data
   - Filters profiles based on target criteria (e.g., domain matching)
   - Composes personalized emails for matching profiles

3. **Email Sending (OutReachAgent)**:
   - Uses EmailTool to send personalized cold emails
   - Tracks sent emails in context variables

4. **Summary**:
   - Provides a summary of the outreach campaign

### Custom Agent Configuration

The OutReach Agent is defined in `src/agents/OutReachAgent.ts`. It includes:
- Agent name and description
- Email tool integration
- Custom system prompt for email composition

**Note**: The agent JSON representation and tool configuration mentioned in the requirements should be provided separately (via MCP or custom configuration). The current implementation uses placeholder code.

### Email Tool (via MCP)

The Email Tool is loaded from the MCP server via `tool_ids`. The tool should be registered in your MCP server with the following capabilities:
- Send emails to recipients
- Validate email addresses
- Track sent emails

**Configuration**: 
- The tool UUID must be specified in `src/agents/OutReachAgent.ts` when creating the OutReachAgent
- The MCP server endpoint is configured via `localStorage.getItem("mcp_base_url")` (default: `http://localhost:8000/api/v2/mcp/custom-tools`)
- MCP authentication token is configured via `localStorage.getItem("id_token")`

**For Production**: Ensure your MCP server has the email tool registered and accessible.

## Customization

### Modify Target Criteria

Edit the workflow prompt in `src/main.ts` to change filtering criteria:
```typescript
// Example: Target different domains
- Target domains: Software Engineering, Product Management, Data Science, or DevOps
```

### Customize Email Template

Modify the OutReach Agent's description in `src/agents/OutReachAgent.ts` to change email composition guidelines.

### Add More Profile Data

1. Add fields to the `Profile` interface in `App.tsx`
2. Update `mockProfiles` with additional data
3. Update the extraction prompt in `main.ts`

## Debugging

- Open browser DevTools (Command + Option + I)
- Check console for agent workflow messages
- Use TraceSystem for detailed execution traces

## Notes

- **MCP Server Required**: Tools are loaded from MCP server, so ensure your MCP server is running and accessible
- **Tool UUIDs**: Replace placeholder tool UUIDs with actual UUIDs from your MCP server
- Profile data is stored in mock data (in production, would come from API/database)
- Agent JSON representation is defined in `src/agents/OutReachAgent.ts` using `Agent.build_from_json`
- The MCP client connects to `/api/v2/mcp/custom-tools` endpoint (adjust if your server uses a different path)

