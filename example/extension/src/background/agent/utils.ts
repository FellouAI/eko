import { Agent } from "@eko-ai/eko"
import { JSONSchema7, Tool } from "@eko-ai/eko/types"

export function wrapToolInputSchema(agent: Agent, tool: Tool) {
  switch (tool.name) {
    case 'watch_trigger':
    case 'human_interact':
    case 'task_node_status':
      return
  }
  const parameters: JSONSchema7 = tool.parameters
  if (parameters.type != 'object') {
    return
  }
  const agentDefalutPrompt: Record<string, string> = {
    Browser: `The user-side prompt, showing what you are doing, e.g. "Openning google.com." or "Click the search button"`,
  }
  // observation, thinking, userSidePrompt
  // observation: Your observation of the previous steps. Should start with "In the previous step, I\'ve ...".
  // thinking: Your thinking draft.
  // userSidePrompt: The user-side prompt, showing what you are doing, e.g. "Openning google.com."
  const properties = new Map()
  // properties.set("thinking", {
  //   type: "string",
  //   description: "Current thinking content, which can be analysis of the problem, assumptions, insights, reflections, or a summary of the previous, suggest the next action step to be taken, which should be specific, executable, and verifiable.",
  // });
  properties.set('userSidePrompt', {
    type: 'string',
    description:
      agentDefalutPrompt[agent.Name] || agentDefalutPrompt['Browser'],
  })
  Object.keys(parameters.properties as any).forEach(key =>
    properties.set(key, (parameters.properties as any)[key]),
  )
  parameters.properties = Object.fromEntries(properties)
  const required: string[] = parameters.required || []
  if (required.indexOf('userSidePrompt') == -1) {
    parameters.required = ['userSidePrompt', ...required]
    // parameters.required = ["thinking", "userSidePrompt", ...required];
  }
}