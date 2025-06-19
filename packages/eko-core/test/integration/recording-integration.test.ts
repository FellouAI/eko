/**
 * Integration test for the generateFromRecording functionality
 */

import { Eko } from "../../src/core/index";
import { WorkflowRecording } from "../../src/types/recording.types";
import * as fs from "fs";
import * as path from "path";

describe("generateFromRecording Integration", () => {
  let eko: Eko;
  let testRecording: WorkflowRecording;

  beforeAll(() => {
    // Load test fixture
    const fixturePath = path.join(__dirname, "../fixtures/recordings/flight-search/recording.workflow.json");
    testRecording = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    
    // Initialize Eko with test configuration
    eko = new Eko({
      llms: {
        default: {
          provider: "openai",
          model: "gpt-4o",
          apiKey: process.env.OPENAI_API_KEY || "test-key",
        }
      },
      agents: [],
    });
  });

  // Skip this test in CI unless we have a real API key
  const runIntegrationTest = process.env.OPENAI_API_KEY && process.env.ENABLE_INTEGRATION_TESTS;

  (runIntegrationTest ? it : it.skip)("should convert recording to workflow using generateFromRecording", async () => {
    const workflow = await eko.generateFromRecording(
      testRecording,
      {
        userGoal: "Search for flights from Shanghai to Beijing",
        useScreenshots: false,
        filterRedundantEvents: true
      }
    );

    // Verify workflow structure
    expect(workflow.name).toBeTruthy();
    expect(workflow.thought).toBeTruthy();
    expect(workflow.agents).toHaveLength(1);
    expect(workflow.agents[0].name).toBe("Browser");
    expect(workflow.agents[0].nodes.length).toBeGreaterThan(5);

    // Verify template variables
    expect(workflow.template).toBeTruthy();
    expect(workflow.template?.variables).toBeTruthy();
    expect(workflow.template?.variables?.length).toBeGreaterThan(0);

    // Verify variable format uses single curly braces
    expect(workflow.xml).toMatch(/\{[^}]+\}/); // Contains single curly braces
    expect(workflow.xml).not.toMatch(/\{\{[^}]+\}\}/); // Does not contain double curly braces

    console.log("Generated workflow summary:");
    console.log("- Name:", workflow.name);
    console.log("- Agents:", workflow.agents.length);
    console.log("- Total nodes:", workflow.agents.reduce((sum, agent) => sum + agent.nodes.length, 0));
    console.log("- Template variables:", workflow.template?.variables?.length || 0);
  }, 30000);

  it("should handle missing LLM configuration", async () => {
    const badEko = new Eko({
      llms: {} as any,
      agents: [],
    });

    await expect(badEko.generateFromRecording(testRecording))
      .rejects.toThrow("Default LLM model is required for recording conversion");
  });

  it("should handle template variable replacement", async () => {
    // Mock a simple workflow for testing variable replacement
    const mockWorkflow = {
      taskId: "test",
      name: "Test Workflow",
      thought: "Test",
      agents: [{
        id: "1",
        name: "Browser",
        task: "Test {city}",
        nodes: [{
          type: "normal" as const,
          text: "Navigate to {url}",
        }],
        xml: "<agent><task>Test {city}</task></agent>"
      }],
      xml: "<root><agent><task>Test {city}</task></agent></root>",
      template: {
        version: "1.0",
        variables: [{
          name: "city",
          type: "string",
          required: true,
          description: "City name"
        }, {
          name: "url", 
          type: "string",
          required: true,
          description: "URL to navigate to"
        }]
      }
    };

    // Mock the converter to return our test workflow
    const converter = require("../../src/core/recording-converter");
    const originalConvertToEkoWorkflow = converter.RecordingToWorkflowService.prototype.convertToEkoWorkflow;
    converter.RecordingToWorkflowService.prototype.convertToEkoWorkflow = jest.fn().mockResolvedValue(mockWorkflow);

    try {
      const workflow = await eko.generateFromRecording(
        testRecording,
        {},
        undefined,
        "test-id",
        { city: "Shanghai", url: "https://example.com" }
      );

      expect(workflow.xml).toContain("Test Shanghai");
      expect(workflow.agents[0].task).toContain("Test Shanghai");
      expect(workflow.agents[0].nodes[0].text).toContain("https://example.com");
    } finally {
      // Restore original method
      converter.RecordingToWorkflowService.prototype.convertToEkoWorkflow = originalConvertToEkoWorkflow;
    }
  });
});