import { Agent, HumanInteractTool, registerCapability } from "@eko-ai/eko";
// @ts-ignore
import { BrowserCapability } from "@eko-ai/eko-web";

// Explicitly register Browser capability to ensure it's available
registerCapability("Browser", BrowserCapability);

/**
 * Web Sourcing Agent - Custom agent for talent sourcing and recruitment outreach
 * 
 * This agent is responsible for:
 * - Browsing web pages to find and extract candidate information (LinkedIn, GitHub, personal websites, etc.)
 * - Drafting personalized recruitment outreach emails based on candidate profiles
 * 
 * Note: The agent JSON representation and tool configuration
 * should be provided separately (using MCP or custom configuration).
 * Tools are loaded from MCP server via tool_ids.
 * 
 * Example agent JSON representation (placeholder):
 * {
 *   "agent_name": "Web Sourcing Agent",
 *   "description": "Agent for talent sourcing and drafting recruitment emails",
 *   "system_prompt": "...",
 *   "tool_ids": ["email-tool-uuid-here"]
 * }
 */


// Agent data - using object literal instead of JSON.parse to avoid control character issues
const agent_data = {
  agent_name: "Web Sourcing Agent",
  description: `An intelligent agent specialized in talent sourcing - browsing the web to find candidate profiles and drafting personalized recruitment outreach emails. This agent can navigate professional networks (LinkedIn, GitHub, etc.), extract candidate information (skills, experience, background), and compose professional recruitment email drafts.`,
  system_prompt: `You are "Web Sourcing Agent," specialized in talent sourcing and recruitment outreach.

Your SOP:

**1. Collect target contact information from current page**
- You are typically already on a page with candidate profiles or contact information
- First, view the current page content using current_page or extract_page_content
- Click on candidate profile cards or person information cards to expand and view more details
- Browse and extract target person information, especially email addresses
- Store all collected contact information (name, email, profile details, etc.) in the variable pool for later use
- Once you have found one, you should immediately store it in the variable pool and continue searching for more.

**2. Draft and send personalized emails**
- Based on contacts stored in the variable pool, draft personalized recruitment emails
- For email subject, recommend options and ask the user to choose or confirm
- Compose professional, personalized emails that reference the candidate's background
- Send emails using the available email tools

Workflow:
1. Start by viewing the current page to understand what you're working with
2. Click on cards and browse to collect contact information, especially emails
3. Store information in the variable pool
4. When ready to send emails, draft personalized content based on stored contacts
5. Ask user for email subject confirmation before sending
6. Send emails to the collected contacts


Tips: 
When you facing auth problem during sending emails, 
Use prompt to ask the user for the authentication information, including the username, and password.
As well as when you not sure about the content of the email, ask the user for the content of the email.
`,
  tools: [
    "3528b83e-0d80-428f-a365-789fbb10f1a8"
  ],
  capabilities: ["Browser"],
  llm_config: {
    model_name: "gpt-5-mini",
    temperature: 0.7,
    max_tokens: 8192,
    top_p: 1.0,
    frequency_penalty: null,
    presence_penalty: null,
    stop_sequences: null
  },
  is_shared: false,
  id: "f56d1f76-0a75-4e81-8f05-d05ffb509320",
  created_at: "2025-11-19T15:54:59.629239",
  updated_at: "2025-11-19T15:54:59.629251",
  status: "draft"
};

export function createOutReachAgent(): Agent {
  // Build agent from JSON representation
  // In production, this JSON would come from your agent registry/database
  const agent = Agent.build_from_json({
    agent_name: agent_data.agent_name,
    description: agent_data.description,
    system_prompt: agent_data.system_prompt,   // Tool IDs to load from MCP server
    // Replace with actual tool UUIDs from your MCP server
    tool_ids: agent_data.tools,
    capabilities: agent_data.capabilities,  // Browser capability for web operations
  });

  // Inject HumanInteractTool for user interaction
  agent.addTool(new HumanInteractTool());

  return agent;
}

