import config from "../config";
import { sub } from "../common/utils";
import Context from "../core/context";

const PLAN_SYSTEM_TEMPLATE = `
You are {name}, an autonomous AI Agent Planner.

## Task Description
Your task is to understand the user's requirements, dynamically plan the user's tasks based on the Agent list, and please follow the steps below:
1. Understand the user's requirements.
2. Analyze the Agents that need to be used based on the user's requirements.
3. Generate the Agent calling plan based on the analysis results.
4. About agent name, please do not arbitrarily fabricate non-existent agent names.
5. You only need to provide the steps to complete the user's task, key steps only, no need to be too detailed.
6. Please strictly follow the output format and example output.
7. The output language should follow the language corresponding to the user's task.

## Agent list
{agents}

## Output Rules and Format
<root>
  <!-- Task Name (Short) -->
  <name>Task Name</name>
  <!-- Need to break down the task into multi-agent collaboration. Please think step by step and output a detailed thought process. -->
  <thought>Your thought process on user demand planning</thought>
  <!-- Multiple Agents work together to complete the task -->
  <agents>
    <!--
    Multi-Agent supports parallelism, coordinating parallel tasks through dependencies, and passing dependent context information through node variables.
    name: The name of the Agent, where the name can only be an available name in the Agent list.
    id: Use subscript order as ID for dependency relationships between multiple agents.
    dependsOn: The IDs of agents that the current agent depends on, separated by commas when there are multiple dependencies.
    -->
    <agent name="Agent name" id="0" dependsOn="">
      <!-- The current Agent needs to complete the task -->
      <task>current agent task</task>
      <nodes>
        <!-- Nodes support input/output variables for parameter passing and dependency handling in multi-agent collaboration. -->
        <node>Complete the corresponding step nodes of the task</node>
        <node input="variable name">...</node>
        <node output="variable name">...</node>
        <!-- When including duplicate tasks, \`forEach\` can be used -->
        <forEach items="list or variable name">
          <node>forEach step node</node>
        </forEach>
        <!-- When you need to monitor changes in webpage DOM elements, you can use \`Watch\`, the loop attribute specifies whether to listen in a loop or listen once. -->
        <watch event="dom" loop="true">
          <description>Monitor task description</description>
          <trigger>
            <node>Trigger step node</node>
            <node>...</node>
          </trigger>
        </watch>
      </nodes>
    </agent>
    <!--
    Multi-agent Collaboration Dependency Example:

    Execution Flow:
    1. Agent 0: Initial agent with no dependencies (executes first)
    2. Agent 1: Depends on Agent 0 completion (executes after Agent 0)
    3. Agent 2 & 3: Both depend on Agent 1 completion (execute in parallel after Agent 1)
    4. Agent 4: Depends on both Agent 2 and Agent 3 completion (executes last)

    Dependency Chain: Agent 0 → Agent 1 → (Agent 2 ∥ Agent 3) → Agent 4
    -->
    <agent name="Agent name" id="0" dependsOn="">...</agent>
    <agent name="Agent name" id="1" dependsOn="0">...</agent>
    <agent name="Agent name" id="2" dependsOn="1">...</agent>
    <agent name="Agent name" id="3" dependsOn="1">...</agent>
    <agent name="Agent name" id="4" dependsOn="2,3">...</agent>
  </agents>
</root>

{example_prompt}
`;

const PLAN_CHAT_EXAMPLE = `User: hello.
Output result:
<root>
  <name>Chat</name>
  <thought>Alright, the user wrote "hello". That's pretty straightforward. I need to respond in a friendly and welcoming manner.</thought>
  <agents>
    <!-- Chat agents can exist without the <task> and <nodes> nodes. -->
    <agent name="Chat" id="0" dependsOn=""></agent>
  </agents>
</root>`;

const PLAN_EXAMPLE_LIST = [
  `User: Open Boss Zhipin, find 10 operation positions in Chengdu, and send a personal introduction to the recruiters based on the page information.
Output result:
<root>
  <name>Submit resume</name>
  <thought>OK, now the user requests me to create a workflow that involves opening the Boss Zhipin website, finding 10 operation positions in Chengdu, and sending personal resumes to the recruiters based on the job information.</thought>
  <agents>
    <agent name="Browser" id="0" dependsOn="">
      <task>Open Boss Zhipin, find 10 operation positions in Chengdu, and send a personal introduction to the recruiters based on the page information.</task>
      <nodes>
        <node>Open Boss Zhipin, enter the job search page</node>
        <node>Set the regional filter to Chengdu and search for operational positions.</node>
        <node>Brows the job list and filter out 10 suitable operation positions.</node>
        <forEach items="list">
          <node>Analyze job requirements</node>
          <node>Send a self-introduction to the recruiter</node>
        </forEach>
      </nodes>
    </agent>
  </agents>
</root>`,
  `User: Help me collect the latest AI news, summarize it, and send it to the "AI news information" group chat on WeChat.
Output result:
<root>
  <name>Latest AI News</name>
  <thought>OK, users need to collect the latest AI news, summarize it, and send it to a WeChat group named "AI news information" This requires automation, including the steps of data collection, processing, and distribution.</thought>
  <agents>
    <agent name="Browser" id="0" dependsOn="">
      <task>Search for the latest updates on AI</task>
      <nodes>
        <node>Open Google</node>
        <node>Search for the latest updates on AI</node>
        <forEach items="list">
          <node>View Details</node>
        </forEach>
        <node output="summaryInfo">Summarize search information</node>
      </nodes>
    </agent>
    <agent name="Computer" id="1" dependsOn="0">
      <task>Send a message to the WeChat group chat "AI news information"</task>
      <nodes>
        <node>Open WeChat</node>
        <node>Search for the "AI news information" chat group</node>
        <node input="summaryInfo">Send summary message</node>
      </nodes>
    </agent>
  </agents>
</root>`,
  `User: Access the Google team's organization page on GitHub, extract all developer accounts from the team, and compile statistics on the countries and regions where these developers are located.
Output result:
<root>
  <name>Statistics of Google Team Developers' Geographic Distribution</name>
  <thought>Okay, I need to first visit GitHub, then find Google's organization page on GitHub, extract the team member list, and individually visit each developer's homepage to obtain location information for each developer. This requires using a browser to complete all operations.</thought>
  <agents>
    <agent name="Browser" id="0" dependsOn="">
      <task>Visit Google GitHub Organization Page and Analyze Developer Geographic Distribution</task>
      <nodes>
        <node>Visit https://github.com/google</node>
        <node>Click "People" tab to view team members</node>
        <node>Scroll the page to load all developer information</node>
        <node output="developers">Extract all developer account information</node>
        <forEach items="developers">
          <node>Visit developer's homepage</node>
          <node>Extract developer's location information</node>
        </forEach>
        <node>Compile and analyze the geographic distribution data of all developers</node>
      </nodes>
    </agent>
  </agents>
</root>`,
  `User: Open Discord to monitor messages in Group A, and automatically reply when new messages are received.
Output result:
<root>
  <name>Automatic reply to Discord messages</name>
  <thought>OK, monitor the chat messages in Discord group A and automatically reply.</thought>
  <agents>
    <agent name="Browser" id="0" dependsOn="">
      <task>Open Group A in Discord</task>
      <nodes>
        <node>Open Discord page</node>
        <node>Find and open Group A</node>
        <watch event="dom" loop="true">
          <description>Monitor new messages in group chat</description>
          <trigger>
            <node>Analyze message content</node>
            <node>Automatic reply to new messages</node>
          </trigger>
        </watch>
      </nodes>
    </agent>
  </agents>
</root>`,
  `User: Search for information about "fellou," compile the results into a summary profile, then share it across social media platforms including Twitter, Facebook, and Reddit. Finally, export the platform sharing operation results to an Excel file.
Output result:
<root>
<name>Fellou Research and Social Media Campaign</name>
<thought>The user wants me to research information about 'Fellou', create a summary profile, share it on multiple social media platforms (Twitter, Facebook, Reddit), and then compile the results into an Excel file. This requires multiple agents working together: Browser for research, Browser for social media posting (Twitter, Facebook, and Reddit in parallel), and File for creating the Excel export. I need to break this down into sequential steps with proper variable passing between agents.</thought>
<agents>
  <agent name="Browser" id="0" dependsOn="">
      <task>Research comprehensive information about 'Fellou'</task>
      <nodes>
        <node>Search for the latest information about 'Fellou' - its identity, purpose, and core features</node>
        <node>Search for Fellou's functionalities, capabilities, and technical specifications</node>
        <node>Search for recent news, updates, announcements, and developments related to Fellou</node>
        <node>Search for user reviews, feedback, and community discussions about Fellou</node>
        <node>Search for Fellou's market position, competitors, and industry context</node>
        <node output="researchData">Compile all research findings into a comprehensive summary profile</node>
      </nodes>
    </agent>
    <agent name="Browser" id="1" dependsOn="0">
      <task>Share Fellou's summary and collected interaction data on Twitter/X</task>
      <nodes>
        <node>Navigate to Twitter/X platform</node>
        <node input="researchData">Create and post Twitter-optimized content about Fellou (within character limits, using hashtags)</node>
        <node output="twitterResults">Capture Twitter post URL and initial engagement metrics</node>
      </nodes>
    </agent>
    <agent name="Browser" id="2" dependsOn="0">
      <task>Share Fellou's summary and collected interaction data on Facebook</task>
      <nodes>
        <node>Navigate to Facebook platform</node>
        <node input="researchData">Create and post Facebook-optimized content about Fellou (longer format, engaging description)</node>
        <node output="facebookResults">Capture Facebook post URL and initial engagement metrics</node>
      </nodes>
    </agent>
    <agent name="Browser" id="3" dependsOn="0">
      <task>Share Fellou's summary and collected interaction data on Reddit</task>
      <nodes>
        <node>Navigate to Reddit platform</node>
        <node input="researchData">Find appropriate subreddit and create Reddit-optimized post about Fellou (community-focused, informative)</node>
        <node output="redditResults">Capture Reddit post URL and initial engagement metrics</node>
      </nodes>
    </agent>
    <agent name="File" id="4" dependsOn="1,2,3">
      <task>Compile social media results into Excel file</task>
      <nodes>
        <node input="twitterResults,facebookResults,redditResults">Create Excel file with social media campaign results</node>
        <node>Include columns for Platform, Post URL, Content Summary, Timestamp, Initial Likes/Shares/Comments</node>
        <node>Format the Excel file with proper headers and styling</node>
        <node>Save the file as 'Fellou_Social_Media_Campaign_Results.xlsx'</node>
      </nodes>
    </agent>
  </agents>
</agents>
</root>`,
];

const PLAN_USER_TEMPLATE = `
User Platform: {platform}
Current datetime: {datetime}
Task Description: {task_prompt}
`;

const PLAN_USER_TASK_WEBSITE_TEMPLATE = `
User Platform: {platform}
Task Website: {task_website}
Current datetime: {datetime}
Task Description: {task_prompt}
`;

export async function getPlanSystemPrompt(context: Context): Promise<string> {
  let agents_prompt = "";
  let agents = context.agents;
  for (let i = 0; i < agents.length; i++) {
    let agent = agents[i];
    let tools = await agent.loadTools(context);
    if ((agent as any).ignorePlan) {
      continue;
    }
    agents_prompt +=
      `<agent name="${agent.Name}">\n` +
      `Description: ${sub(
        agent.PlanDescription || agent.Description,
        4000,
        true
      )}\n` +
      "Tools:\n" +
      tools
        .filter((tool) => !tool.noPlan)
        .map(
          (tool) =>
            `  - ${tool.name}: ${sub(
              tool.planDescription || tool.description || "",
              500,
              true
            )}`
        )
        .join("\n") +
      "\n</agent>\n\n";
  }
  let plan_example_list =
    context.variables.get("plan_example_list") || PLAN_EXAMPLE_LIST;
  let hasChatAgent = context.agents.filter((a) => a.Name == "Chat").length > 0;
  let example_prompt = "";
  const example_list = hasChatAgent
    ? [PLAN_CHAT_EXAMPLE, ...plan_example_list]
    : [...plan_example_list];
  for (let i = 0; i < example_list.length; i++) {
    example_prompt += `## Example ${i + 1}\n${example_list[i]}\n\n`;
  }
  return PLAN_SYSTEM_TEMPLATE.replace("{name}", config.name)
    .replace("{agents}", agents_prompt.trim())
    .replace("{example_prompt}", example_prompt)
    .trim();
}

export function getPlanUserPrompt(
  task_prompt: string,
  task_website?: string,
  ext_prompt?: string
): string {
  let prompt = "";
  if (task_website) {
    prompt = PLAN_USER_TASK_WEBSITE_TEMPLATE.replace(
      "{task_website}",
      task_website
    );
  } else {
    prompt = PLAN_USER_TEMPLATE;
  }
  prompt = prompt
    .replace("{task_prompt}", task_prompt)
    .replace("{platform}", config.platform)
    .replace("{datetime}", new Date().toLocaleString())
    .trim();
  if (ext_prompt) {
    prompt += `\n${ext_prompt.trim()}`;
  }
  return prompt;
}
