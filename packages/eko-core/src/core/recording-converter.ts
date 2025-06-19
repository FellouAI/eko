import { LanguageModelV1 } from "@ai-sdk/provider";
import { generateText } from "ai";
import { WorkflowRecording, BrowserEvent, ConversionOptions, ConversionResult, EventType } from "../types/recording.types";
import { loadImageFile } from "../common/utils";
import Log from "../common/log";
import { parseWorkflow } from "../common/xml";
import { Workflow } from "../types/core.types";
import * as path from "path";

const EKO_CONVERSION_PROMPT = `You are a senior software engineer working with the Eko automation framework.
Your task is to convert a JSON recording of browser events into an *executable Eko XML workflow* that the runtime can consume **directly**.

Input Steps Format:
- Each step from the input recording will be provided in a separate message.
- The message will contain the JSON representation of the step.
- If a screenshot is available and relevant for that step, it will follow the JSON in the format:
    <Screenshot for event type 'TYPE'>
    [Image Data]

Follow these rules when generating the Eko XML workflow:
0. The first thing you will output is the "workflow_analysis". First analyze the original workflow recording, what it is about and create a general analysis of the workflow. Also think about which variables are going to be needed for the workflow.
1. Root structure must include: "name", "thought", "agents", and optionally "template" (if variables are needed).
2. Template variables:
   - Include a <template version="1.0"> section if the workflow needs parameterization
   - Define variables with name, type (string/number/date/boolean), required, and description
   - Always aim to include at least one variable unless the workflow is explicitly static (e.g., always navigates to a fixed URL with no user-driven variability)
   - Base variables on the user goal, event parameters (e.g., search queries, form inputs), or potential reusable values. For example, if the workflow searches for a term, include a variable like "search_term"
   - Extract variables from recorded input values to make workflows reusable across different contexts
3. Agents and nodes - **CRITICAL DECISION LOGIC**:
   - Group all browser actions under a single Browser agent
   - Node content: Always put the action description as direct text within the <node> element
   - **Agent nodes** (default, no executionMode attribute) - Use for tasks where the user must interact with or select from frequently changing content, even if the website's structure is consistent:
     - **Replace deterministic steps with agent nodes** when the task involves:
       - Selecting from a list or set of options that changes frequently (e.g., restaurants, products, search results, autocomplete suggestions)
       - Interacting with time-sensitive or context-dependent elements (e.g., picking a date from a calendar or a time slot from a schedule)
       - Evaluating content to match user input (e.g., finding a specific item based on its name or attributes)
     - Simple format: <node>Description of what to do from user perspective</node>
     - Examples: "Select the restaurant named {restaurant_name} from search results", "Choose a product matching the criteria", "Pick a date from the calendar"
     - Break complex tasks into multiple specific agent steps rather than one broad task
   - **Nodes with selectors** (default behavior - no executionMode needed):
     - Use for UI interactions where we have selectors: form inputs, navigation, clicking buttons
     - These nodes will try selector-based execution first, then fall back to LLM if needed
     - Include description as text, then add <action> element with structured data
     - Action types use namespaced format: browser.click, browser.input, browser.navigate, etc.
     - Include all selector information (css and xpath) when available
     - Reference screenshot files when provided
   - Format for nodes with selectors (automatic LLM fallback):
     <node>
       Description of the action
       <action type="browser.click">
         <selector css=".button" xpath="//button[@class='button']" />
         <screenshot>screenshots/step_001.jpg</screenshot>
       </action>
     </node>
4. Variable references:
   - Use {variable_name} syntax in text content and attributes
   - Do not use prefixes like "input."
5. Preserve all selector information from events for deterministic execution
6. Consider direct navigation to URLs instead of multiple clicks when appropriate

High-level task description provided by the user (may be empty):
{goal}

IMPORTANT EXAMPLES OF NODE TYPES:
- Typing in a search box → node with selectors (automatic LLM fallback)
- Clicking a submit button → node with selectors (automatic LLM fallback)  
- Selecting an item from autocomplete suggestions → AGENT NODE (no selectors)
- Choosing a specific result from search results → AGENT NODE (no selectors)
- Clicking to open a date picker → node with selectors (automatic LLM fallback)
- Selecting a specific date from a calendar → AGENT NODE (no selectors)
- Navigation to URLs → node with selectors (automatic LLM fallback)

Remember: Nodes with <action> blocks will automatically try selectors first and fall back to LLM if needed. No executionMode attribute required.

Expected output format is an Eko XML workflow like:
<root>
  <name>Workflow Name</name>
  <thought>Analysis and reasoning about the workflow</thought>
  <template version="1.0">
    <variables>
      <variable name="var_name" type="string" required="true" description="Description" />
    </variables>
  </template>
  <agents>
    <agent name="Browser">
      <task>Main task description</task>
      <nodes>
        <node>
          Navigate to website
          <action type="browser.navigate">
            <url>{variable}</url>
          </action>
        </node>
        <node>Select the best item from dynamic search results</node>
        <node>
          Click submit button
          <action type="browser.click">
            <selector css="#submit" xpath="//button[@id='submit']" />
            <screenshot>screenshots/submit.jpg</screenshot>
          </action>
        </node>
      </nodes>
    </agent>
  </agents>
</root>

IMPORTANT: Output ONLY the XML workflow. Do not include any markdown formatting, code blocks, or explanations.

Input session events will follow one-by-one in subsequent messages.`;

export class RecordingToWorkflowService {
  private model: LanguageModelV1;

  constructor(model: LanguageModelV1) {
    this.model = model;
  }

  /**
   * Filter and process events to remove redundant actions
   */
  private filterEvents(events: BrowserEvent[]): BrowserEvent[] {
    const filtered: BrowserEvent[] = [];
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const nextEvent = events[i + 1];
      
      // Skip redundant input events (multiple chars to same field)
      if (event.type === EventType.INPUT && nextEvent?.type === EventType.INPUT) {
        if (event.cssSelector === nextEvent.cssSelector && 
            event.value && nextEvent.value && 
            nextEvent.value.startsWith(event.value)) {
          continue; // Skip this event, keep the next one with more complete input
        }
      }
      
      // Skip pure navigation events if they're immediately followed by user action
      if (event.type === EventType.NAVIGATION && nextEvent) {
        if (nextEvent.type !== EventType.NAVIGATION) {
          continue; // Skip, the navigation will be implicit
        }
      }
      
      filtered.push(event);
    }
    
    return filtered;
  }

  /**
   * Extract potential template variables from input events
   */
  private extractVariables(events: BrowserEvent[]): Array<{name: string, type: string, description: string, value: string}> {
    const variables: Array<{name: string, type: string, description: string, value: string}> = [];
    const seenValues = new Set<string>();
    
    for (const event of events) {
      if (event.type === EventType.INPUT && event.value && event.value.length > 2) {
        if (seenValues.has(event.value)) continue;
        seenValues.add(event.value);
        
        // Try to infer variable names from selectors or context
        let varName = 'input_value';
        let description = 'User input value';
        
        if (event.cssSelector?.includes('search') || event.elementText?.toLowerCase().includes('search')) {
          varName = 'search_term';
          description = 'Search query term';
        } else if (event.cssSelector?.includes('name') || event.cssSelector?.includes('first')) {
          varName = 'first_name';
          description = 'First name';
        } else if (event.cssSelector?.includes('email')) {
          varName = 'email';
          description = 'Email address';
        } else if (event.cssSelector?.includes('from') || event.cssSelector?.toLowerCase().includes('departure')) {
          varName = 'departure_location';
          description = 'Departure location';
        } else if (event.cssSelector?.includes('to') || event.cssSelector?.toLowerCase().includes('destination')) {
          varName = 'destination_location';
          description = 'Destination location';
        }
        
        // Ensure unique variable names
        let counter = 1;
        let finalName = varName;
        while (variables.some(v => v.name === finalName)) {
          finalName = `${varName}_${counter}`;
          counter++;
        }
        
        variables.push({
          name: finalName,
          type: 'string',
          description,
          value: event.value
        });
      }
    }
    
    return variables;
  }

  /**
   * Load and encode screenshot if available
   */
  private loadScreenshot(event: BrowserEvent, workflowDirectory?: string): string | null {
    if (!event.screenshot || !workflowDirectory) {
      return null;
    }
    
    const screenshotPath = path.join(workflowDirectory, event.screenshot);
    const imageData = loadImageFile(screenshotPath);
    
    if (imageData) {
      return `data:${imageData.mimeType};base64,${imageData.base64}`;
    }
    
    return null;
  }

  /**
   * Convert browser events to Eko XML workflow
   */
  async convertToWorkflow(
    recording: WorkflowRecording, 
    options: ConversionOptions = {},
    workflowDirectory?: string
  ): Promise<ConversionResult> {
    const {
      userGoal = "Automate the recorded browser actions",
      useScreenshots = true,
      maxImages = 20,
      filterRedundantEvents = true
    } = options;

    Log.info(`Converting recording '${recording.name}' with ${recording.steps.length} steps`);

    // Filter events if requested
    let events = recording.steps;
    if (filterRedundantEvents) {
      events = this.filterEvents(events);
      Log.info(`Filtered to ${events.length} events`);
    }

    // Add source directory to events for screenshot loading
    if (workflowDirectory) {
      events = events.map(event => ({
        ...event,
        _source_dir: workflowDirectory
      }));
    }

    // Prepare messages for LLM
    const messages: any[] = [];
    
    // Add main prompt
    const promptText = EKO_CONVERSION_PROMPT.replace('{goal}', userGoal);
    messages.push({
      type: "text",
      text: promptText
    });

    // Add each event as a separate message
    let imagesUsed = 0;
    for (const event of events) {
      const stepMessages: any[] = [];
      
      // Add event JSON (without screenshot data to avoid duplication)
      const eventCopy = { ...event };
      delete eventCopy.screenshot;
      delete eventCopy._source_dir;
      
      stepMessages.push({
        type: "text",
        text: JSON.stringify(eventCopy, null, 2)
      });
      
      // Add screenshot if available and under limit
      const attachImage = useScreenshots && imagesUsed < maxImages && event.type !== EventType.INPUT;
      
      if (attachImage && event.screenshot) {
        const imageUrl = this.loadScreenshot(event, workflowDirectory);
        if (imageUrl) {
          const meta = `<Screenshot for event type '${event.type}'>`;
          stepMessages.push({
            type: "text", 
            text: meta
          });
          stepMessages.push({
            type: "image",
            image: imageUrl
          });
          imagesUsed++;
        }
      }
      
      messages.push(...stepMessages);
    }

    Log.info(`Prepared ${messages.length} message parts, including ${imagesUsed} images`);

    // Generate workflow using LLM
    try {
      const response = await generateText({
        model: this.model,
        messages: [
          {
            role: "user",
            content: messages
          }
        ],
        temperature: 0,
        maxTokens: 8000
      });

      const xmlContent = this.parseXmlOutput(response.text);
      
      // Parse workflow to extract metadata
      const analysis = this.extractWorkflowAnalysis(xmlContent);
      const variables = this.extractWorkflowVariables(xmlContent);
      const { nodeCount, actionNodeCount, agentNodeCount } = this.countNodes(xmlContent);

      return {
        workflow: xmlContent,
        analysis,
        variables,
        nodeCount,
        actionNodeCount,
        agentNodeCount
      };

    } catch (error) {
      Log.error('Error converting recording to workflow:', error);
      throw new Error(`Failed to convert recording: ${error}`);
    }
  }

  /**
   * Extract XML from LLM response, handling markdown formatting
   */
  private parseXmlOutput(response: string): string {
    Log.debug('Raw LLM Output:', response);
    
    // Remove markdown code blocks
    if (response.includes('```xml')) {
      const match = response.match(/```xml\s*([\s\S]*?)\s*```/);
      if (match) {
        response = match[1].trim();
      }
    } else if (response.includes('```')) {
      const match = response.match(/```\s*([\s\S]*?)\s*```/);
      if (match) {
        response = match[1].trim();
      }
    }
    
    // Find the root element
    const rootMatch = response.match(/<root>[\s\S]*<\/root>/);
    if (rootMatch) {
      return rootMatch[0];
    }
    
    return response.trim();
  }

  /**
   * Extract workflow analysis from XML
   */
  private extractWorkflowAnalysis(xml: string): string {
    const thoughtMatch = xml.match(/<thought>([\s\S]*?)<\/thought>/);
    return thoughtMatch ? thoughtMatch[1].trim() : "No analysis provided";
  }

  /**
   * Extract template variables from XML
   */
  private extractWorkflowVariables(xml: string): Array<{name: string, type: string, description: string, required: boolean}> {
    const variables: Array<{name: string, type: string, description: string, required: boolean}> = [];
    
    const variableMatches = xml.matchAll(/<variable\s+([^>]+)\/>/g);
    for (const match of variableMatches) {
      const attrs = match[1];
      const nameMatch = attrs.match(/name="([^"]+)"/);
      const typeMatch = attrs.match(/type="([^"]+)"/);
      const descMatch = attrs.match(/description="([^"]+)"/);
      const requiredMatch = attrs.match(/required="([^"]+)"/);
      
      if (nameMatch) {
        variables.push({
          name: nameMatch[1],
          type: typeMatch ? typeMatch[1] : 'string',
          description: descMatch ? descMatch[1] : '',
          required: requiredMatch ? requiredMatch[1] === 'true' : true
        });
      }
    }
    
    return variables;
  }

  /**
   * Count different types of nodes in the workflow
   */
  private countNodes(xml: string): {nodeCount: number, actionNodeCount: number, agentNodeCount: number} {
    const nodeMatches = xml.matchAll(/<node[^>]*>([\s\S]*?)<\/node>/g);
    let nodeCount = 0;
    let actionNodeCount = 0;
    let agentNodeCount = 0;
    
    for (const match of nodeMatches) {
      nodeCount++;
      const nodeContent = match[1];
      if (nodeContent.includes('<action')) {
        actionNodeCount++;
      } else {
        agentNodeCount++;
      }
    }
    
    return { nodeCount, actionNodeCount, agentNodeCount };
  }

  /**
   * Convert recording to Eko Workflow object
   */
  async convertToEkoWorkflow(
    recording: WorkflowRecording,
    options: ConversionOptions = {},
    workflowDirectory?: string
  ): Promise<Workflow> {
    const result = await this.convertToWorkflow(recording, options, workflowDirectory);
    
    // Parse XML to Workflow object
    const workflow = parseWorkflow(
      `recording-${Date.now()}`,
      result.workflow,
      false // Not sequential mode by default
    );
    
    if (!workflow) {
      throw new Error('Failed to parse generated workflow XML');
    }
    
    return workflow;
  }
}