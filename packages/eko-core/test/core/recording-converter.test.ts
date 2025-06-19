/**
 * Tests for RecordingToWorkflowService - browser event recording to Eko workflow conversion
 */

import { RecordingToWorkflowService } from "../../src/core/recording-converter";
import { WorkflowRecording, ConversionOptions, EventType } from "../../src/types/recording.types";
import { openai } from "@ai-sdk/openai";
import * as fs from "fs";
import * as path from "path";

// Mock LLM for testing
const mockLLM = {
  specificationVersion: "v1",
  modelId: "test-model",
  defaultObjectGenerationMode: "json" as const,
  doGenerate: jest.fn(),
  doStream: jest.fn(),
  provider: "test"
};

describe("RecordingToWorkflowService", () => {
  let service: RecordingToWorkflowService;
  let testRecording: WorkflowRecording;

  beforeAll(() => {
    // Load test fixture
    const fixturePath = path.join(__dirname, "../fixtures/recordings/flight-search/recording.workflow.json");
    testRecording = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  });

  beforeEach(() => {
    service = new RecordingToWorkflowService(mockLLM as any);
    jest.clearAllMocks();
  });

  describe("Event Filtering", () => {
    it("should filter redundant input events", () => {
      const events = [
        { type: EventType.INPUT, cssSelector: "#test", value: "s", timestamp: 1 },
        { type: EventType.INPUT, cssSelector: "#test", value: "sh", timestamp: 2 },
        { type: EventType.INPUT, cssSelector: "#test", value: "sha", timestamp: 3 },
        { type: EventType.CLICK, cssSelector: "#btn", timestamp: 4 }
      ] as any[];

      const filtered = (service as any).filterEvents(events);
      
      // Should keep only the final input and the click
      expect(filtered).toHaveLength(2);
      expect(filtered[0].value).toBe("sha");
      expect(filtered[1].type).toBe(EventType.CLICK);
    });

    it("should preserve input events to different selectors", () => {
      const events = [
        { type: EventType.INPUT, cssSelector: "#input1", value: "test1", timestamp: 1 },
        { type: EventType.INPUT, cssSelector: "#input2", value: "test2", timestamp: 2 }
      ] as any[];

      const filtered = (service as any).filterEvents(events);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].cssSelector).toBe("#input1");
      expect(filtered[1].cssSelector).toBe("#input2");
    });
  });

  describe("Variable Extraction", () => {
    it("should extract variables from input events", () => {
      const events = [
        { 
          type: EventType.INPUT, 
          cssSelector: "input[placeholder*='search']", 
          value: "flights to paris",
          timestamp: 1 
        },
        {
          type: EventType.INPUT,
          cssSelector: "input[name='email']",
          value: "test@example.com", 
          timestamp: 2
        }
      ] as any[];

      const variables = (service as any).extractVariables(events);
      
      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe("search_term");
      expect(variables[0].value).toBe("flights to paris");
      expect(variables[1].name).toBe("first_name");
      expect(variables[1].value).toBe("test@example.com");
    });

    it("should handle duplicate variable names", () => {
      const events = [
        { type: EventType.INPUT, cssSelector: "input[name='name']", value: "John", timestamp: 1 },
        { type: EventType.INPUT, cssSelector: "input[placeholder='name']", value: "Doe", timestamp: 2 }
      ] as any[];

      const variables = (service as any).extractVariables(events);
      
      expect(variables).toHaveLength(2);
      expect(variables[0].name).toBe("first_name");
      expect(variables[1].name).toBe("first_name_1");
    });
  });

  describe("Workflow Conversion", () => {
    it("should convert recording to workflow with proper variable syntax", async () => {
      // Mock LLM response with single curly braces
      const mockWorkflowXml = `<root>
  <name>Test Workflow</name>
  <thought>Test workflow for unit testing</thought>
  <template version="1.0">
    <variables>
      <variable name="test_var" type="string" required="true" description="Test variable" />
    </variables>
  </template>
  <agents>
    <agent name="Browser">
      <task>Test task with {test_var}</task>
      <nodes>
        <node>
          Navigate to test page
          <action type="browser.navigate">
            <url>https://test.com/{test_var}</url>
          </action>
        </node>
      </nodes>
    </agent>
  </agents>
</root>`;

      mockLLM.doGenerate.mockResolvedValue({
        text: mockWorkflowXml,
        finishReason: "stop",
        usage: { promptTokens: 100, completionTokens: 200 }
      });

      const result = await service.convertToWorkflow(testRecording);

      expect(result.workflow).toContain("{test_var}");
      expect(result.workflow).not.toContain("{{test_var}}");
      expect(result.nodeCount).toBeGreaterThan(0);
    });

    it("should handle conversion options", async () => {
      const mockWorkflowXml = `<root><name>Test</name><thought>Test</thought><agents><agent name="Browser"><task>Test</task><nodes><node>Test</node></nodes></agent></agents></root>`;
      
      mockLLM.doGenerate.mockResolvedValue({
        text: mockWorkflowXml,
        finishReason: "stop",
        usage: { promptTokens: 50, completionTokens: 100 }
      });

      const options: ConversionOptions = {
        userGoal: "Custom test goal",
        useScreenshots: false,
        maxImages: 5,
        filterRedundantEvents: true
      };

      const result = await service.convertToWorkflow(testRecording, options);

      expect(mockLLM.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: "text",
                  text: expect.stringContaining("Custom test goal")
                })
              ])
            })
          ])
        })
      );
    });

    it("should handle LLM errors gracefully", async () => {
      mockLLM.doGenerate.mockRejectedValue(new Error("LLM Error"));

      await expect(service.convertToWorkflow(testRecording))
        .rejects.toThrow("Failed to convert recording: Error: LLM Error");
    });
  });

  describe("XML Parsing", () => {
    it("should extract workflow analysis", () => {
      const xml = `<root><thought>This is a test workflow analysis</thought></root>`;
      const analysis = (service as any).extractWorkflowAnalysis(xml);
      expect(analysis).toBe("This is a test workflow analysis");
    });

    it("should extract template variables", () => {
      const xml = `<root>
        <template version="1.0">
          <variables>
            <variable name="test_var" type="string" required="true" description="Test variable" />
            <variable name="num_var" type="number" required="false" description="Number variable" />
          </variables>
        </template>
      </root>`;
      
      const variables = (service as any).extractWorkflowVariables(xml);
      
      expect(variables).toHaveLength(2);
      expect(variables[0]).toEqual({
        name: "test_var",
        type: "string",
        required: true,
        description: "Test variable"
      });
      expect(variables[1]).toEqual({
        name: "num_var",
        type: "number",
        required: false,
        description: "Number variable"
      });
    });

    it("should count nodes correctly", () => {
      const xml = `<root>
        <agents>
          <agent name="Browser">
            <nodes>
              <node>
                Plain agent node
              </node>
              <node>
                Node with action
                <action type="browser.click">
                  <selector css="#test" />
                </action>
              </node>
              <node>Another agent node</node>
            </nodes>
          </agent>
        </agents>
      </root>`;
      
      const counts = (service as any).countNodes(xml);
      
      expect(counts.nodeCount).toBe(3);
      expect(counts.actionNodeCount).toBe(1);
      expect(counts.agentNodeCount).toBe(2);
    });
  });

  describe("Real Recording Integration", () => {
    // Skip this test in CI unless we have a real API key
    const runIntegrationTest = process.env.OPENAI_API_KEY && process.env.ENABLE_INTEGRATION_TESTS;
    
    (runIntegrationTest ? it : it.skip)("should convert real flight search recording", async () => {
      // Use real LLM for integration test
      const realService = new RecordingToWorkflowService(
        openai("gpt-4o")
      );

      const result = await realService.convertToWorkflow(testRecording, {
        userGoal: "Search for flights from Shanghai to Beijing",
        useScreenshots: false,
        filterRedundantEvents: true
      });

      expect(result.workflow).toContain("<root>");
      expect(result.workflow).toContain("</root>");
      expect(result.workflow).toContain("{"); // Should use single curly braces
      expect(result.workflow).not.toContain("{{"); // Should not use double curly braces
      expect(result.nodeCount).toBeGreaterThan(5);
      expect(result.variables.length).toBeGreaterThan(0);
      
      console.log("Generated workflow variables:", result.variables);
      console.log("Node counts:", {
        total: result.nodeCount,
        withActions: result.actionNodeCount,
        agentOnly: result.agentNodeCount
      });
    }, 30000); // 30 second timeout for LLM call
  });
});