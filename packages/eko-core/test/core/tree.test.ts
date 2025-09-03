import { buildAgentTree, parseWorkflow, uuidv4, Workflow } from "../../src";

async function testAgentTree() {
  const xml = `
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
  <agent name="Browser" id="4" dependsOn="2">
    <task>Share Fellou's summary and collected interaction data on Facebook-2</task>
    <nodes>
      <node>Navigate to Facebook platform</node>
      <node input="researchData">Create and post Facebook-optimized content about Fellou (longer format, engaging description)</node>
      <node output="facebookResults2">Capture Facebook post URL and initial engagement metrics</node>
    </nodes>
  </agent>
  <agent name="Browser" id="5" dependsOn="3">
    <task>Share Fellou's summary and collected interaction data on Reddit-2</task>
    <nodes>
      <node>Navigate to Reddit platform</node>
      <node input="researchData">Find appropriate subreddit and create Reddit-optimized post about Fellou (community-focused, informative)</node>
      <node output="redditResults2">Capture Reddit2 post URL and initial engagement metrics</node>
    </nodes>
  </agent>
  <agent name="File" id="6" dependsOn="1,4,5">
    <task>Compile social media results into Excel file</task>
    <nodes>
      <node input="twitterResults,facebookResults,facebookResults2,redditResults,redditResults2">Create Excel file with social media campaign results</node>
      <node>Include columns for Platform, Post URL, Content Summary, Timestamp, Initial Likes/Shares/Comments</node>
      <node>Format the Excel file with proper headers and styling</node>
      <node>Save the file as 'Fellou_Social_Media_Campaign_Results.xlsx'</node>
    </nodes>
  </agent>
</agents>
</root>
  `;
  const workflow = parseWorkflow(uuidv4(), xml, true) as Workflow;
  const tree = buildAgentTree(workflow.agents);
  console.log(JSON.stringify(tree, null, 2));
}

test.only("test", async () => {
  await testAgentTree();
});
